
import mongoose from 'mongoose';
import { Tool } from '../models/tool.model.js';
import { Counter } from '../models/counter.model.js';
import ToolAuditLog from '../models/toolAuditLog.model.js';
import ToolIdGenerator from '../utils/tool-id.js';
import * as XLSX from 'xlsx';

const applyAdvancedFilters = (query, params) => {
    if (params.search) {
        if (!query.$and) query.$and = [];
        query.$and.push({
            $or: [
                { description: { $regex: params.search, $options: 'i' } },
                { toolId: { $regex: params.search, $options: 'i' } },
                { toolCode: { $regex: params.search, $options: 'i' } }
            ]
        });
    }

    if (params.category && params.category !== 'All') {
        query.toolType = { $regex: `^${params.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }

    if (params.status && params.status !== 'All') {
        query.status = { $regex: `^${params.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }

    const filterFields = [
        'description', 'toolId', 'toolCode', 'toolType', 'status', 'makeYear',
        'capacity', 'safeWorkingLoad', 'metalType', 'toolVariant',
        'dateOfSupply', 'validityPeriod', 'purchaserName', 'purchaserContact',
        'supplierCode', 'jobCode', 'remarks'
    ];

    for (const field of filterFields) {
        if (field === 'toolType' && query.toolType) continue;
        if (field === 'status' && query.status) continue;
        const val = params[field];
        if (val && val !== 'All' && val !== '' && val !== undefined) {
            if (field === 'validityPeriod') {
                if (!query.$and) query.$and = [];
                const escapedVal = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                query.$and.push({
                    $or: [
                        { validityPeriod: { $regex: escapedVal, $options: 'i' } },
                        { 'customFields.validation': { $regex: escapedVal, $options: 'i' } },
                        { 'customFields.validityPeriod': { $regex: escapedVal, $options: 'i' } }
                    ]
                });
            } else {
                query[field] = { $regex: val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
            }
        }
    }
};

export const resequenceProjectToolSerials = async (projectId) => {
    if (!projectId) return;
    const projIdStr = projectId._id ? projectId._id.toString() : projectId.toString();
    const isObjId = mongoose.Types.ObjectId.isValid(projIdStr);

    const matchQuery = {
        $or: [
            { project: projIdStr },
            ...(isObjId ? [{ project: new mongoose.Types.ObjectId(projIdStr) }] : []),
            { currentSite: projIdStr },
            ...(isObjId ? [{ currentSite: new mongoose.Types.ObjectId(projIdStr) }] : [])
        ],
        isDeleted: { $ne: true },
        isScrapped: { $ne: true }
    };

    const activeTools = await Tool.find(matchQuery).sort({ createdAt: 1, _id: 1 });

    let currentSerial = 1;
    const updates = [];

    for (const tool of activeTools) {
        // Printed tools must NEVER have their serial number or Tool ID altered during re-sequencing!
        if (tool.isPrinted) {
            if (tool.serialNumber >= currentSerial) {
                currentSerial = tool.serialNumber + 1;
            }
            continue;
        }

        const newToolId = ToolIdGenerator.generateToolId(tool, currentSerial);
        const newQrLink = ToolIdGenerator.generateQrLink(newToolId);

        if (tool.serialNumber !== currentSerial || tool.toolId !== newToolId) {
            updates.push({
                tool,
                newSerial: currentSerial,
                newToolId,
                newQrLink
            });
        }
        currentSerial++;
    }

    if (updates.length > 0) {
        // Pass 1: Assign temporary toolId to avoid E11000 duplicate key collision on { project: 1, toolId: 1 }
        const tempOps = updates.map(({ tool }) => ({
            updateOne: {
                filter: { _id: tool._id },
                update: { $set: { toolId: `__TEMP_${tool._id}_${Date.now()}` } }
            }
        }));
        await Tool.bulkWrite(tempOps);

        // Pass 2: Assign final serial numbers, toolIds, and QR links
        const finalOps = updates.map(({ tool, newSerial, newToolId, newQrLink }) => ({
            updateOne: {
                filter: { _id: tool._id },
                update: {
                    $set: {
                        serialNumber: newSerial,
                        toolId: newToolId,
                        qrLink: newQrLink
                    }
                }
            }
        }));
        await Tool.bulkWrite(finalOps);
    }

    const projectScopeKey = ToolIdGenerator.getProjectScopeKey({ project: projIdStr });
    const counterId = `tool_serial_${projectScopeKey.replace(/[^A-Z0-9_-]/gi, '_')}`;
    await Counter.findByIdAndUpdate(counterId, { seq: currentSerial - 1 }, { upsert: true });
};

const getToolsByStoreId = async (storeId, params = {}) => {
    const { page = 1, limit = 10, sortBy = 'serialNumber', sortOrder = 'asc' } = params;
    const query = {
        $or: [
            { currentSite: storeId },
            { store: storeId }
        ],
        isDeleted: { $ne: true },
        isScrapped: { $ne: true }
    };

    if (params.assignedToolIds && Array.isArray(params.assignedToolIds)) {
        query._id = { $in: params.assignedToolIds };
    }

    applyAdvancedFilters(query, params);

    // Self-healing backfill for any legacy records missing numeric serialNumber
    try {
        const unindexed = await Tool.find({ toolId: { $exists: true }, $or: [{ serialNumber: { $exists: false } }, { serialNumber: null }] }).limit(50);
        for (const t of unindexed) {
            const match = t.toolId ? t.toolId.match(/\d+$/) : null;
            if (match) {
                t.serialNumber = parseInt(match[0], 10);
                await t.save();
            }
        }
    } catch (e) {
        // Silently ignore backfill errors
    }

    const sort = {};
    if (sortBy === 'toolId' || sortBy === 'serialNumber') {
        sort.serialNumber = sortOrder === 'asc' ? 1 : -1;
        sort.toolId = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy) {
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode')
            .populate('currentSite', 'name location')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit)),
        Tool.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
    };
};

const processToolData = (toolData) => {
    const data = {};
    const customFields = {};
    const corePaths = Object.keys(Tool.schema.paths);

    for (const key of Object.keys(toolData)) {
        if (corePaths.includes(key)) {
            data[key] = toolData[key];
        } else {
            customFields[key] = toolData[key];
        }
    }

    data.customFields = { ...toolData.customFields, ...customFields };
    return data;
};

const createToolInStore = async (toolData) => {
    const data = processToolData(toolData);
    if (!data.currentSite && toolData.storeId) data.currentSite = toolData.storeId;
    if (!data.store && data.currentSite) data.store = data.currentSite;
    if (!data.project && data.currentSite) {
        const store = await mongoose.model('Store').findById(data.currentSite);
        if (store && store.project) {
            data.project = store.project;
        }
    }
    if (!data.toolId) {
        const projectScopeKey = ToolIdGenerator.getProjectScopeKey(data);
        const serialNum = await ToolIdGenerator.allocateSerial(projectScopeKey);
        data.toolId = ToolIdGenerator.generateToolId(data, serialNum);
        data.serialNumber = serialNum;
        data.qrLink = ToolIdGenerator.generateQrLink(data.toolId);
    }
    const tool = new Tool(data);
    await tool.save();
    return tool;
};

const addValidityPeriods = (existingVal, newVal) => {
    if (newVal === undefined || newVal === null || String(newVal).trim() === '') {
        return existingVal;
    }
    const newMatch = String(newVal).match(/(\d+)/);
    if (!newMatch) {
        return newVal;
    }
    const newYears = parseInt(newMatch[1], 10);
    if (!existingVal || existingVal === 'N/A' || String(existingVal).trim() === '' || String(existingVal).trim() === '-') {
        return String(newVal).toLowerCase().includes('year') ? newVal : `${newVal} Years`;
    }
    const existingMatch = String(existingVal).match(/(\d+)/);
    if (!existingMatch) {
        return String(newVal).toLowerCase().includes('year') ? newVal : `${newVal} Years`;
    }
    const existingYears = parseInt(existingMatch[1], 10);
    const totalYears = existingYears + newYears;
    return `${totalYears} Years`;
};

const updateToolById = async (id, toolData) => {
    const data = processToolData(toolData);
    delete data.toolId;
    delete data.qrLink;
    if (toolData.validityPeriod !== undefined) {
        const existingTool = await Tool.findById(id);
        if (existingTool) {
            const rawVal = existingTool.validityPeriod || '';
            const existingVal = (rawVal && rawVal !== 'N/A')
                ? rawVal
                : (existingTool.customFields?.get?.('validation') || existingTool.customFields?.get?.('validityPeriod') || rawVal);
            data.validityPeriod = addValidityPeriods(existingVal, toolData.validityPeriod);
        }
    }
    const tool = await Tool.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!tool) throw new Error('Tool not found');
    return tool;
};

const deleteToolById = async (id, user = {}) => {
    const tool = await Tool.findById(id);
    if (!tool) throw new Error('Tool not found');

    if (tool.isDeleted || tool.isScrapped) {
        return tool; // Already soft deleted or scrapped
    }

    const userInfo = {
        _id: user?._id || null,
        name: user?.name || user?.username || 'System User',
        email: user?.email || 'system@landt.com'
    };

    if (!tool.originalSerialNumber) {
        tool.originalSerialNumber = tool.serialNumber;
    }

    if (tool.isPrinted) {
        // PRINTED TOOL -> Move to Scrap, DO NOT re-sequence active tools!
        tool.isDeleted = true;
        tool.isScrapped = true;
        tool.status = 'Scrapped';
        tool.scrappedAt = new Date();
        tool.scrappedBy = userInfo;
        await tool.save();

        const auditLog = new ToolAuditLog({
            user: userInfo,
            dateTime: new Date(),
            action: 'Scrap Printed Tool',
            store: tool.currentSite || tool.store,
            affectedToolsCount: 1,
            toolIds: [tool.toolId],
            remarks: `Moved printed tool ${tool.toolId} to Scrap (no re-sequencing)`
        });
        await auditLog.save();

        return tool;
    } else {
        // UNPRINTED TOOL -> Soft Delete to Trash, RE-SEQUENCE active tools!
        tool.isDeleted = true;
        tool.isScrapped = false;
        tool.status = 'Deleted';
        tool.deletedAt = new Date();
        tool.deletedBy = userInfo;
        await tool.save();

        if (tool.project || tool.currentSite) {
            await resequenceProjectToolSerials(tool.project || tool.currentSite);
        }

        const auditLog = new ToolAuditLog({
            user: userInfo,
            dateTime: new Date(),
            action: 'Delete Unprinted Tool',
            store: tool.currentSite || tool.store,
            affectedToolsCount: 1,
            toolIds: [tool.toolId],
            remarks: `Soft deleted unprinted tool ${tool.toolId}`
        });
        await auditLog.save();

        return tool;
    }
};

const bulkDeleteTools = async ({ toolIds, storeId, user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Specific tool IDs must be selected for bulk delete');
    }

    let query = {
        _id: { $in: toolIds },
        isDeleted: { $ne: true },
        isScrapped: { $ne: true }
    };

    if (storeId) {
        query.$or = [
            { currentSite: storeId },
            { store: storeId }
        ];
    }

    const toolsToDelete = await Tool.find(query);
    if (!toolsToDelete || toolsToDelete.length === 0) {
        return { count: 0, message: 'No active tools found to delete' };
    }

    const userInfo = {
        _id: user?._id || null,
        name: user?.name || user?.username || 'System User',
        email: user?.email || 'system@landt.com'
    };

    const affectedProjectIds = new Set();
    const targetToolIds = [];

    for (const tool of toolsToDelete) {
        targetToolIds.push(tool.toolId || tool._id.toString());
        if (!tool.originalSerialNumber) {
            tool.originalSerialNumber = tool.serialNumber;
        }

        if (tool.isPrinted) {
            // Move printed tool to Scrap - DO NOT resequence
            tool.isDeleted = true;
            tool.isScrapped = true;
            tool.status = 'Scrapped';
            tool.scrappedAt = new Date();
            tool.scrappedBy = userInfo;
        } else {
            // Soft delete unprinted tool to Trash - WILL resequence
            tool.isDeleted = true;
            tool.isScrapped = false;
            tool.status = 'Deleted';
            tool.deletedAt = new Date();
            tool.deletedBy = userInfo;

            if (tool.project) affectedProjectIds.add(tool.project.toString());
            else if (tool.currentSite) affectedProjectIds.add(tool.currentSite.toString());
        }
        await tool.save();
    }

    for (const projId of affectedProjectIds) {
        await resequenceProjectToolSerials(projId);
    }

    const auditLog = new ToolAuditLog({
        user: userInfo,
        dateTime: new Date(),
        action: 'Bulk Delete Tools',
        store: storeId || undefined,
        affectedToolsCount: toolsToDelete.length,
        toolIds: targetToolIds,
        remarks: `Bulk deleted ${toolsToDelete.length} tools`
    });
    await auditLog.save();

    return { count: toolsToDelete.length, auditLogId: auditLog._id };
};

const getDeletedTools = async (params = {}) => {
    const { page = 1, limit = 10, search = '', storeId, projectId, sortBy = 'deletedAt', sortOrder = 'desc' } = params;
    const query = { isDeleted: true, isScrapped: { $ne: true } };

    if (storeId && storeId !== 'All') {
        query.$or = [
            { currentSite: storeId },
            { store: storeId }
        ];
    } else if (projectId && projectId !== 'All') {
        query.project = projectId;
    }

    if (search) {
        if (!query.$and) query.$and = [];
        query.$and.push({
            $or: [
                { description: { $regex: search, $options: 'i' } },
                { toolId: { $regex: search, $options: 'i' } },
                { toolCode: { $regex: search, $options: 'i' } }
            ]
        });
    }

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [data, total] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode')
            .populate('currentSite', 'name location')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit)),
        Tool.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
    };
};

const getScrappedTools = async (params = {}) => {
    const { page = 1, limit = 10, search = '', storeId, projectId, sortBy = 'scrappedAt', sortOrder = 'desc' } = params;
    const query = { isScrapped: true };

    if (storeId && storeId !== 'All') {
        query.$or = [
            { currentSite: storeId },
            { store: storeId }
        ];
    } else if (projectId && projectId !== 'All') {
        query.project = projectId;
    }

    if (search) {
        if (!query.$and) query.$and = [];
        query.$and.push({
            $or: [
                { description: { $regex: search, $options: 'i' } },
                { toolId: { $regex: search, $options: 'i' } },
                { toolCode: { $regex: search, $options: 'i' } }
            ]
        });
    }

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [data, total] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode')
            .populate('currentSite', 'name location')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit)),
        Tool.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
    };
};

const markToolsAsPrinted = async ({ toolIds, user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Specific tool IDs must be selected to mark as printed');
    }

    const userInfo = {
        _id: user?._id || null,
        name: user?.name || user?.username || 'System User',
        email: user?.email || 'system@landt.com'
    };

    const result = await Tool.updateMany(
        { _id: { $in: toolIds } },
        {
            $set: {
                isPrinted: true,
                printedAt: new Date(),
                printedBy: userInfo
            }
        }
    );

    const auditLog = new ToolAuditLog({
        user: userInfo,
        dateTime: new Date(),
        action: 'Mark Tools Printed',
        affectedToolsCount: result.modifiedCount,
        toolIds,
        remarks: `Marked ${result.modifiedCount} tools as Printed`
    });
    await auditLog.save();

    return { count: result.modifiedCount };
};

const restoreToolById = async (id, user = {}) => {
    const tool = await Tool.findById(id);
    if (!tool) throw new Error('Tool not found');

    if (!tool.isDeleted && !tool.isScrapped) {
        return tool; // Already active
    }

    const wasUnprinted = !tool.isPrinted;
    tool.isDeleted = false;
    tool.isScrapped = false;
    tool.status = 'Available';
    tool.deletedAt = null;
    tool.deletedBy = null;
    tool.scrappedAt = null;
    tool.scrappedBy = null;
    await tool.save();

    if (wasUnprinted && (tool.project || tool.currentSite)) {
        await resequenceProjectToolSerials(tool.project || tool.currentSite);
    }

    const auditLog = new ToolAuditLog({
        user: {
            _id: user?._id,
            name: user?.name || user?.username || 'System User',
            email: user?.email || 'system@landt.com'
        },
        dateTime: new Date(),
        action: 'Restore Tool',
        store: tool.currentSite || tool.store,
        affectedToolsCount: 1,
        toolIds: [tool.toolId],
        remarks: `Restored tool ${tool.toolId}`
    });
    await auditLog.save();

    return tool;
};

const bulkRestoreTools = async ({ toolIds, user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Specific tool IDs must be selected for bulk restore');
    }

    const toolsToRestore = await Tool.find({
        _id: { $in: toolIds },
        $or: [{ isDeleted: true }, { isScrapped: true }]
    });

    if (!toolsToRestore || toolsToRestore.length === 0) {
        return { count: 0, message: 'No deleted or scrapped tools found to restore' };
    }

    const affectedProjectIds = new Set();
    const targetToolIds = [];

    for (const tool of toolsToRestore) {
        targetToolIds.push(tool.toolId || tool._id.toString());
        const wasUnprinted = !tool.isPrinted;
        tool.isDeleted = false;
        tool.isScrapped = false;
        tool.status = 'Available';
        tool.deletedAt = null;
        tool.deletedBy = null;
        tool.scrappedAt = null;
        tool.scrappedBy = null;
        await tool.save();

        if (wasUnprinted) {
            if (tool.project) affectedProjectIds.add(tool.project.toString());
            else if (tool.currentSite) affectedProjectIds.add(tool.currentSite.toString());
        }
    }

    for (const projId of affectedProjectIds) {
        await resequenceProjectToolSerials(projId);
    }

    const auditLog = new ToolAuditLog({
        user: {
            _id: user?._id,
            name: user?.name || user?.username || 'System User',
            email: user?.email || 'system@landt.com'
        },
        dateTime: new Date(),
        action: 'Bulk Restore Tools',
        affectedToolsCount: toolsToRestore.length,
        toolIds: targetToolIds,
        remarks: `Bulk restored ${toolsToRestore.length} tools`
    });
    await auditLog.save();

    return { count: toolsToRestore.length, auditLogId: auditLog._id };
};

const permanentDeleteToolById = async (id, user = {}) => {
    const tool = await Tool.findById(id);
    if (!tool) throw new Error('Tool not found');

    const projectId = tool.project || tool.currentSite;
    const toolIdStr = tool.toolId || tool._id.toString();
    const storeId = tool.currentSite || tool.store;

    await Tool.findByIdAndDelete(id);

    if (projectId) {
        await resequenceProjectToolSerials(projectId);
    }

    const auditLog = new ToolAuditLog({
        user: {
            _id: user?._id,
            name: user?.name || user?.username || 'System User',
            email: user?.email || 'system@landt.com'
        },
        dateTime: new Date(),
        action: 'Permanent Delete Tool',
        store: storeId,
        affectedToolsCount: 1,
        toolIds: [toolIdStr],
        remarks: `Permanently deleted tool ${toolIdStr}`
    });
    await auditLog.save();

    return { success: true, message: 'Tool permanently deleted' };
};

const bulkPermanentDeleteTools = async ({ toolIds, user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Specific tool IDs must be selected for bulk permanent delete');
    }

    const toolsToDelete = await Tool.find({ _id: { $in: toolIds } });
    if (!toolsToDelete || toolsToDelete.length === 0) {
        return { count: 0, message: 'No matching tools found for permanent deletion' };
    }

    const affectedProjectIds = new Set();
    const targetToolIds = [];

    for (const tool of toolsToDelete) {
        targetToolIds.push(tool.toolId || tool._id.toString());
        if (tool.project) affectedProjectIds.add(tool.project.toString());
        else if (tool.currentSite) affectedProjectIds.add(tool.currentSite.toString());
    }

    await Tool.deleteMany({ _id: { $in: toolIds } });

    for (const projId of affectedProjectIds) {
        await resequenceProjectToolSerials(projId);
    }

    const auditLog = new ToolAuditLog({
        user: {
            _id: user?._id,
            name: user?.name || user?.username || 'System User',
            email: user?.email || 'system@landt.com'
        },
        dateTime: new Date(),
        action: 'Bulk Permanent Delete Tools',
        affectedToolsCount: toolsToDelete.length,
        toolIds: targetToolIds,
        remarks: `Permanently deleted ${toolsToDelete.length} tools`
    });
    await auditLog.save();

    return { count: toolsToDelete.length, auditLogId: auditLog._id };
};

const exportToolsByStoreId = async (storeId, params = {}) => {
    const { sortBy = 'createdAt', sortOrder = 'desc', exportScope = 'filtered', exportType = 'excel' } = params;
    const query = {
        $or: [
            { currentSite: storeId },
            { store: storeId }
        ],
        isDeleted: { $ne: true }
    };

    if (exportScope === 'filtered') {
        applyAdvancedFilters(query, params);
    }

    const sort = {};
    if (sortBy) {
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    const tools = await Tool.find(query)
        .populate('project', 'name projectCode')
        .populate('currentSite', 'name location')
        .sort(sort)
        .lean();

    const data = tools.map(t => ({
        'description': t.description || '',
        'make': t.makeYear || '',
        'capacity': t.capacity || '',
        'safe_working_load': t.safeWorkingLoad || '',
        'purchaser_name': t.purchaserName || '',
        'supplier_code': t.supplierCode || '',
        'date_of_supply': t.dateOfSupply || '',
        'tool_type': t.toolType || '',
        'metal_type': t.metalType || '',
        'tool_varient': t.toolVariant || '',
        'purchaser_contact': t.purchaserContact || '',
        'job_code': t.jobCode || '',
        'job_description': t.jobDescription || '',
        'current_site': t.currentSite ? (t.currentSite.name || t.currentSite.location || '') : '',
        'validation': (t.validityPeriod && t.validityPeriod !== 'N/A')
            ? t.validityPeriod
            : (t.customFields?.validation || t.customFields?.validityPeriod || t.validityPeriod || ''),
        'ITEM_CODE': t.toolCode || '',
        'tool id creation': t.toolId || '',
        'QR LINK ': t.qrLink || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tools");

    const bookType = exportType === 'csv' ? 'csv' : 'xlsx';
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType });

    return buffer;
};

const getToolById = async (id) => {
    let query = { toolId: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
        query = { $or: [{ _id: id }, { toolId: id }] };
    }
    return await Tool.findOne(query).populate('project').populate('currentSite').lean();
};

const getToolFilterOptions = async (storeId) => {
    const fields = [
        'toolId', 'toolCode', 'description', 'toolType', 'status', 'toolVariant',
        'makeYear', 'capacity', 'safeWorkingLoad', 'metalType',
        'purchaserName', 'purchaserContact', 'supplierCode',
        'dateOfSupply', 'validityPeriod', 'jobCode', 'remarks'
    ];
    const options = {};
    const storeQuery = {
        $or: [
            { currentSite: storeId },
            { store: storeId }
        ],
        isDeleted: { $ne: true }
    };
    await Promise.all(fields.map(async (field) => {
        let values = [];
        if (field === 'validityPeriod') {
            const [coreVals, customValidationVals, customPeriodVals] = await Promise.all([
                Tool.distinct('validityPeriod', storeQuery),
                Tool.distinct('customFields.validation', storeQuery),
                Tool.distinct('customFields.validityPeriod', storeQuery)
            ]);
            values = Array.from(new Set([...coreVals, ...customValidationVals, ...customPeriodVals]));
        } else {
            values = await Tool.distinct(field, storeQuery);
        }
        options[field] = values
            .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
            .map(String)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }));
    return options;
};

const bulkEditTools = async ({ storeId, toolIds, filterCriteria, updates, user }) => {
    if (!updates || Object.keys(updates).length === 0) {
        throw new Error('No fields provided for bulk edit');
    }

    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Specific tool IDs must be selected for bulk edit');
    }

    let query = {
        _id: { $in: toolIds },
        isDeleted: { $ne: true }
    };

    if (storeId) {
        query.$or = [
            { currentSite: storeId },
            { store: storeId }
        ];
    }

    const toolsToUpdate = await Tool.find(query);

    if (!toolsToUpdate || toolsToUpdate.length === 0) {
        return { count: 0, message: 'No matching tools found to update' };
    }

    const corePaths = Object.keys(Tool.schema.paths);
    const snapshots = [];
    const targetToolIds = [];

    for (const tool of toolsToUpdate) {
        targetToolIds.push(tool.toolId || tool._id.toString());
        const oldValues = {};
        const newValues = {};

        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === null || value === '') continue;

            let finalValue = value;
            if (key === 'validityPeriod') {
                const rawVal = tool.validityPeriod || '';
                const existingVal = (rawVal && rawVal !== 'N/A')
                    ? rawVal
                    : (tool.customFields?.get?.('validation') || tool.customFields?.get?.('validityPeriod') || rawVal);
                finalValue = addValidityPeriods(existingVal, value);
            }

            if (corePaths.includes(key)) {
                oldValues[key] = tool[key];
                newValues[key] = finalValue;
                tool[key] = finalValue;
            } else {
                oldValues[key] = tool.customFields ? tool.customFields.get(key) : undefined;
                newValues[key] = finalValue;
                if (!tool.customFields) tool.customFields = new Map();
                tool.customFields.set(key, finalValue);
            }
        }

        snapshots.push({
            toolId: tool.toolId || tool._id.toString(),
            _id: tool._id,
            oldValues,
            newValues
        });

        await tool.save();
    }

    const auditLog = new ToolAuditLog({
        user: {
            _id: user?._id,
            name: user?.name || 'System User',
            email: user?.email || 'system@landt.com'
        },
        dateTime: new Date(),
        action: 'Bulk Edit',
        store: storeId || undefined,
        affectedToolsCount: toolsToUpdate.length,
        toolIds: targetToolIds,
        updatesApplied: updates,
        snapshots,
        remarks: `Bulk updated ${toolsToUpdate.length} tools`
    });

    await auditLog.save();

    return {
        count: toolsToUpdate.length,
        auditLogId: auditLog._id
    };
};

const transferTools = async ({ sourceStoreId, destinationStoreId, toolIds, remarks = '', user = {} }) => {
    if (!sourceStoreId || !destinationStoreId) {
        throw new Error('Source Store and Destination Store are required');
    }

    if (sourceStoreId.toString() === destinationStoreId.toString()) {
        throw new Error('Source Store and Destination Store must be different');
    }

    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('At least one tool must be selected for transfer');
    }

    const { Store } = await import('../models/store.model.js');
    const [sourceStore, destinationStore] = await Promise.all([
        Store.findById(sourceStoreId).populate('project'),
        Store.findById(destinationStoreId).populate('project')
    ]);

    if (!sourceStore) {
        throw new Error('Source Store not found');
    }

    if (!destinationStore) {
        throw new Error('Destination Store not found');
    }

    // Business Rule Check: Stores MUST belong to the SAME project!
    const sourceProjId = sourceStore.project?._id ? sourceStore.project._id.toString() : sourceStore.project?.toString();
    const destProjId = destinationStore.project?._id ? destinationStore.project._id.toString() : destinationStore.project?.toString();

    if (!sourceProjId || !destProjId || sourceProjId !== destProjId) {
        throw new Error('Cross-project tool transfers are prohibited. Tools can only be transferred between stores belonging to the same project.');
    }

    const query = {
        _id: { $in: toolIds },
        $or: [
            { currentSite: sourceStoreId },
            { store: sourceStoreId }
        ],
        isDeleted: { $ne: true },
        isScrapped: { $ne: true }
    };

    const toolsToTransfer = await Tool.find(query);
    if (!toolsToTransfer || toolsToTransfer.length === 0) {
        throw new Error('No active eligible tools found in source store for transfer');
    }

    const transferRef = `TRF-${Date.now()}`;
    const snapshots = [];
    const movementDocs = [];
    const targetToolIdStrings = [];

    for (const tool of toolsToTransfer) {
        const oldStoreName = sourceStore.name || 'Source Store';
        const newStoreName = destinationStore.name || 'Destination Store';
        targetToolIdStrings.push(tool.toolId || tool._id.toString());

        snapshots.push({
            toolId: tool.toolId || tool._id.toString(),
            _id: tool._id,
            oldValues: { store: sourceStore._id, currentSite: sourceStore._id },
            newValues: { store: destinationStore._id, currentSite: destinationStore._id }
        });

        // Update tool location while preserving Tool ID, serial, QR code & specifications
        tool.currentSite = destinationStore._id;
        tool.store = destinationStore._id;
        if (remarks && remarks.trim()) {
            tool.remarks = tool.remarks ? `${tool.remarks} | ${remarks.trim()}` : remarks.trim();
        }
        await tool.save();

        movementDocs.push({
            tool: tool._id,
            toolIdStr: tool.toolId || tool._id.toString(),
            description: tool.description || '',
            movementType: 'Transfer',
            from: `${oldStoreName} (${sourceStore.storeCode || 'STORE'})`,
            to: `${newStoreName} (${destinationStore.storeCode || 'STORE'})`,
            referenceNumber: transferRef,
            date: new Date(),
            user: user?.name || user?.username || 'System User',
            remarks: remarks.trim() || `Transferred from ${oldStoreName} to ${newStoreName}`
        });
    }

    if (movementDocs.length > 0) {
        const { ToolMovement } = await import('../models/toolMovement.model.js');
        await ToolMovement.insertMany(movementDocs);
    }

    const auditLog = new ToolAuditLog({
        user: {
            _id: user?._id,
            name: user?.name || 'System User',
            email: user?.email || 'system@landt.com'
        },
        dateTime: new Date(),
        action: 'Intra-Project Store Transfer',
        store: destinationStore._id,
        affectedToolsCount: toolsToTransfer.length,
        toolIds: targetToolIdStrings,
        updatesApplied: {
            fromStore: sourceStore.name,
            toStore: destinationStore.name,
            transferRef
        },
        snapshots,
        remarks: remarks.trim() || `Transferred ${toolsToTransfer.length} tools from ${sourceStore.name} to ${destinationStore.name}`
    });

    await auditLog.save();

    return {
        count: toolsToTransfer.length,
        transferRef,
        sourceStore: { _id: sourceStore._id, name: sourceStore.name },
        destinationStore: { _id: destinationStore._id, name: destinationStore.name },
        auditLogId: auditLog._id
    };
};

export const toolService = {
    getToolsByStoreId,
    createToolInStore,
    updateToolById,
    deleteToolById,
    bulkDeleteTools,
    getDeletedTools,
    getScrappedTools,
    markToolsAsPrinted,
    restoreToolById,
    bulkRestoreTools,
    permanentDeleteToolById,
    bulkPermanentDeleteTools,
    exportToolsByStoreId,
    getToolById,
    getToolFilterOptions,
    bulkEditTools,
    transferTools
};


