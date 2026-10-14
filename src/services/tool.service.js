
import mongoose from 'mongoose';
import { Tool } from '../models/tool.model.js';
import { Counter } from '../models/counter.model.js';
import ToolAuditLog from '../models/toolAuditLog.model.js';
import ToolIdGenerator from '../utils/tool-id.js';
import * as XLSX from 'xlsx';

const applyAdvancedFilters = (query, params) => {
    if (params.search && String(params.search).trim()) {
        if (!query.$and) query.$and = [];
        const rawSearch = String(params.search).trim();

        let tokens = [];
        if (rawSearch.includes(',') || rawSearch.includes('\n') || rawSearch.includes('|') || rawSearch.includes(';') || rawSearch.includes('\t')) {
            const rawTokens = rawSearch.split(/[\n,|\t;]+/).map(t => t.trim()).filter(Boolean);
            for (const rt of rawTokens) {
                tokens.push(...rt.split(/\s+/).map(s => s.trim()).filter(Boolean));
            }
        } else {
            const spaceTokens = rawSearch.split(/[\s|\t;]+/).map(s => s.trim()).filter(Boolean);
            const looksLikeMultipleCodes = spaceTokens.length > 1 && spaceTokens.every(t => /^[A-Za-z0-9_-]+$/.test(t) && (/\d/.test(t) || t.length >= 6));
            if (looksLikeMultipleCodes) {
                tokens = spaceTokens;
            } else {
                tokens = [rawSearch];
            }
        }

        const uniqueTokens = [];
        const seenLower = new Set();
        for (const tok of tokens) {
            const lower = tok.toLowerCase();
            if (!seenLower.has(lower)) {
                seenLower.add(lower);
                uniqueTokens.push(tok);
            }
        }

        if (uniqueTokens.length === 1) {
            const escapedSearch = uniqueTokens[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$and.push({
                $or: [
                    { description: { $regex: escapedSearch, $options: 'i' } },
                    { toolId: { $regex: escapedSearch, $options: 'i' } },
                    { toolCode: { $regex: escapedSearch, $options: 'i' } }
                ]
            });
        } else if (uniqueTokens.length > 1) {
            const tokenOrConditions = [];
            for (const tok of uniqueTokens) {
                const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                tokenOrConditions.push(
                    { toolId: { $regex: `^${escaped}$`, $options: 'i' } },
                    { toolCode: { $regex: `^${escaped}$`, $options: 'i' } },
                    { toolId: { $regex: escaped, $options: 'i' } },
                    { toolCode: { $regex: escaped, $options: 'i' } },
                    { description: { $regex: escaped, $options: 'i' } }
                );
            }
            query.$and.push({ $or: tokenOrConditions });
        }
    }

    if (params.category && params.category !== 'All' && String(params.category).trim()) {
        const escapedCat = String(params.category).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.toolType = { $regex: escapedCat, $options: 'i' };
    }

    if (params.status && params.status !== 'All' && String(params.status).trim()) {
        const escapedStat = String(params.status).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.status = { $regex: escapedStat, $options: 'i' };
    }

    const printVal = params.printStatus || params.isPrinted;
    if (printVal && printVal !== 'All' && String(printVal).trim()) {
        const strVal = String(printVal).trim().toLowerCase();
        if (strVal === 'printed' || strVal === 'true') {
            query.isPrinted = true;
        } else if (strVal === 'not printed' || strVal === 'unprinted' || strVal === 'false') {
            query.isPrinted = { $ne: true };
        }
    }

    // Special handling for Validation / Validity / validityPeriod
    const validityVal = params.validityPeriod || params.validation || params.validity;
    if (validityVal && validityVal !== 'All' && String(validityVal).trim() !== '') {
        const strVal = String(validityVal).trim();
        const yearsMatch = strVal.match(/(\d+)/);
        if (!query.$and) query.$and = [];

        if (yearsMatch) {
            const num = parseInt(yearsMatch[1], 10);
            const regexNumPattern = `(${num}\\s*year|${num}\\s*years|${num}\\s*yr|\\b${num}\\b)`;
            if (num === 1) {
                query.$and.push({
                    $or: [
                        { validityPeriod: { $regex: regexNumPattern, $options: 'i' } },
                        { validation: { $regex: regexNumPattern, $options: 'i' } },
                        { 'customFields.validation': { $regex: regexNumPattern, $options: 'i' } },
                        { 'customFields.validityPeriod': { $regex: regexNumPattern, $options: 'i' } },
                        {
                            $and: [
                                {
                                    $or: [
                                        { validityPeriod: { $in: [null, '', 'N/A', '-'] } },
                                        { validityPeriod: { $exists: false } }
                                    ]
                                },
                                {
                                    $or: [
                                        { purchaserName: { $regex: 'third party inspection', $options: 'i' } },
                                        { 'customFields.purchaserName': { $regex: 'third party inspection', $options: 'i' } }
                                    ]
                                }
                            ]
                        }
                    ]
                });
            } else if (num === 3) {
                query.$and.push({
                    $or: [
                        { validityPeriod: { $regex: regexNumPattern, $options: 'i' } },
                        { validation: { $regex: regexNumPattern, $options: 'i' } },
                        { 'customFields.validation': { $regex: regexNumPattern, $options: 'i' } },
                        { 'customFields.validityPeriod': { $regex: regexNumPattern, $options: 'i' } },
                        {
                            $and: [
                                {
                                    $or: [
                                        { validityPeriod: { $in: [null, '', 'N/A', '-'] } },
                                        { validityPeriod: { $exists: false } }
                                    ]
                                },
                                {
                                    $or: [
                                        { purchaserName: { $not: /third party inspection/i } },
                                        { purchaserName: { $exists: false } }
                                    ]
                                }
                            ]
                        }
                    ]
                });
            } else {
                query.$and.push({
                    $or: [
                        { validityPeriod: { $regex: regexNumPattern, $options: 'i' } },
                        { validation: { $regex: regexNumPattern, $options: 'i' } },
                        { 'customFields.validation': { $regex: regexNumPattern, $options: 'i' } },
                        { 'customFields.validityPeriod': { $regex: regexNumPattern, $options: 'i' } }
                    ]
                });
            }
        } else {
            const escapedVal = strVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$and.push({
                $or: [
                    { validityPeriod: { $regex: escapedVal, $options: 'i' } },
                    { validation: { $regex: escapedVal, $options: 'i' } },
                    { 'customFields.validation': { $regex: escapedVal, $options: 'i' } },
                    { 'customFields.validityPeriod': { $regex: escapedVal, $options: 'i' } }
                ]
            });
        }
    }

    const filterFields = [
        'description', 'toolId', 'toolCode', 'toolType', 'status', 'makeYear',
        'capacity', 'safeWorkingLoad', 'metalType', 'toolVariant',
        'dateOfSupply', 'purchaserName', 'purchaserContact',
        'supplierCode', 'jobCode', 'jobDescription', 'remarks', 'subcontractorName'
    ];

    for (const field of filterFields) {
        if (field === 'toolType' && query.toolType) continue;
        if (field === 'status' && query.status) continue;
        const val = params[field];
        if (val && val !== 'All' && String(val).trim() !== '' && val !== undefined) {
            const escapedVal = String(val).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!query.$and) query.$and = [];
            query.$and.push({
                $or: [
                    { [field]: { $regex: escapedVal, $options: 'i' } },
                    { [`customFields.${field}`]: { $regex: escapedVal, $options: 'i' } }
                ]
            });
        }
    }
};

export const resequenceProjectToolSerials = async (projectId) => {
    if (!projectId) return;
    const projIdStr = projectId._id ? projectId._id.toString() : projectId.toString();
    const isObjId = mongoose.Types.ObjectId.isValid(projIdStr);

    const projectOrSiteFilter = {
        $or: [
            { project: projIdStr },
            ...(isObjId ? [{ project: new mongoose.Types.ObjectId(projIdStr) }] : []),
            { currentSite: projIdStr },
            ...(isObjId ? [{ currentSite: new mongoose.Types.ObjectId(projIdStr) }] : [])
        ]
    };

    // 1. Ensure any soft-deleted unprinted tools in DB have their toolId prefixed with __TRASHED_
    // so they do not collide with active tools during resequencing in unique index { project: 1, toolId: 1 }.
    const trashedUnprintedTools = await Tool.find({
        ...projectOrSiteFilter,
        isDeleted: true,
        isPrinted: { $ne: true },
        toolId: { $not: /^__TRASHED_/ }
    }).select('_id toolId').lean();

    if (trashedUnprintedTools.length > 0) {
        const trashOps = trashedUnprintedTools.map(t => ({
            updateOne: {
                filter: { _id: t._id },
                update: { $set: { toolId: `__TRASHED_${t._id}_${t.toolId || ''}` } }
            }
        }));
        await Tool.bulkWrite(trashOps);
    }

    // 2. Fetch all printed tools (active or scrapped) for this project.
    // Printed tools' serial numbers and toolId strings are physically printed and immutable.
    const printedTools = await Tool.find({
        ...projectOrSiteFilter,
        isPrinted: true
    }).select('serialNumber toolId').lean();

    const printedSerials = new Set(printedTools.map(t => t.serialNumber).filter(Boolean));
    const printedToolIds = new Set(printedTools.map(t => t.toolId).filter(id => id && !id.startsWith('__TEMP_')));

    // 3. Fetch active (non-deleted, non-scrapped) tools to resequence.
    const activeTools = await Tool.find({
        ...projectOrSiteFilter,
        isDeleted: { $ne: true },
        isScrapped: { $ne: true }
    }).sort({ createdAt: 1, _id: 1 });

    let currentSerial = 1;
    const updates = [];

    for (const tool of activeTools) {
        // Printed tools must NEVER have their serial number or Tool ID altered during re-sequencing,
        // unless their toolId was accidentally left stuck with a __TEMP_ prefix.
        if (tool.isPrinted && tool.toolId && !tool.toolId.startsWith('__TEMP_')) {
            continue;
        }

        // Find next available serial number not reserved by printed tools or existing printed tool IDs
        let newToolId = ToolIdGenerator.generateToolId(tool, currentSerial);
        while (printedSerials.has(currentSerial) || printedToolIds.has(newToolId)) {
            currentSerial++;
            newToolId = ToolIdGenerator.generateToolId(tool, currentSerial);
        }

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
        // Pass 1: Assign temporary toolId in bulk to avoid E11000 duplicate key collision on { project: 1, toolId: 1 }
        const tempOps = updates.map(({ tool }) => ({
            updateOne: {
                filter: { _id: tool._id },
                update: { $set: { toolId: `__TEMP_${tool._id}_${Date.now()}` } }
            }
        }));
        await Tool.bulkWrite(tempOps, { ordered: false });

        // Pass 2: Assign final serial numbers, toolIds, and QR links in bulk
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
        await Tool.bulkWrite(finalOps, { ordered: false });

        // Only printed tools can have foreign references in Challans, Movements, or Missing lists.
        // Unprinted tools are never dispatched on Challans, avoiding up to 18,000 redundant queries.
        const printedUpdates = updates.filter(
            ({ tool, newToolId }) => tool.isPrinted && tool.toolId && !tool.toolId.startsWith('__TEMP_') && tool.toolId !== newToolId
        );

        if (printedUpdates.length > 0) {
            await Promise.all(
                printedUpdates.map(({ tool, newToolId }) => syncToolIdReferences(tool._id, tool.toolId, newToolId))
            );
        }
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

    // Self-healing reconciliation: Reconcile returned tool statuses from completed Return Challans
    try {
        const { reconcileReturnedToolStatuses } = await import('./challan.service.js');
        if (typeof reconcileReturnedToolStatuses === 'function') {
            await reconcileReturnedToolStatuses();
        }
    } catch (e) {
        // Silently continue
    }

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

    // Automatic Validation Period Generation based on Purchaser Name
    const purchaserStr = (data.purchaserName || '').trim().toLowerCase();
    const rawValidity = (data.validityPeriod || '').trim();
    if (!rawValidity || rawValidity === '' || rawValidity === 'N/A' || rawValidity === '-') {
        if (purchaserStr === 'third party inspection' || purchaserStr.includes('third party inspection')) {
            data.validityPeriod = '1 Year';
        } else {
            data.validityPeriod = '3 Years';
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

export const syncToolIdReferences = async (toolObjectId, oldToolId, newToolId) => {
    if (!oldToolId || !newToolId || oldToolId === newToolId) return;

    try {
        const { Challan } = await import('../models/challan.model.js');
        const { ToolMovement } = await import('../models/toolMovement.model.js');
        const { MissingTool } = await import('../models/missingTool.model.js');
        const { default: ToolAuditLog } = await import('../models/toolAuditLog.model.js');

        const objId = mongoose.Types.ObjectId.isValid(toolObjectId) 
            ? new mongoose.Types.ObjectId(toolObjectId.toString())
            : toolObjectId;
        const idStr = toolObjectId.toString();

        // 1. Update Challan items (target strictly by unique tool ObjectId)
        await Challan.updateMany(
            {
                $or: [
                    { 'items.tool': objId },
                    { 'items.tool': idStr }
                ]
            },
            {
                $set: { 'items.$[elem].toolId': newToolId }
            },
            {
                arrayFilters: [
                    {
                        $or: [
                            { 'elem.tool': objId },
                            { 'elem.tool': idStr }
                        ]
                    }
                ]
            }
        );

        // 2. Update ToolMovement records (target strictly by unique tool ObjectId)
        await ToolMovement.updateMany(
            {
                $or: [
                    { tool: objId },
                    { tool: idStr }
                ]
            },
            {
                $set: { toolIdStr: newToolId }
            }
        );

        // 3. Update MissingTool records (target strictly by unique tool ObjectId)
        await MissingTool.updateMany(
            {
                $or: [
                    { tool: objId },
                    { tool: idStr }
                ]
            },
            {
                $set: { toolIdStr: newToolId }
            }
        );

        // 4. Update ToolAuditLog snapshots (target strictly by unique tool ObjectId)
        await ToolAuditLog.updateMany(
            {
                $or: [
                    { 'snapshots._id': objId },
                    { 'snapshots._id': idStr }
                ]
            },
            {
                $set: { 'snapshots.$[elem].toolId': newToolId }
            },
            {
                arrayFilters: [
                    {
                        $or: [
                            { 'elem._id': objId },
                            { 'elem._id': idStr }
                        ]
                    }
                ]
            }
        );
    } catch (error) {
        console.error(`[syncToolIdReferences] Error syncing toolId references for tool ${toolObjectId}:`, error);
    }
};

const updateToolById = async (id, toolData) => {
    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
        query = { _id: id };
    } else {
        query = { toolId: id };
        if (toolData && toolData.project && mongoose.Types.ObjectId.isValid(toolData.project)) {
            query.project = toolData.project;
        }
    }
    const existingTool = await Tool.findOne(query);
    if (!existingTool) throw new Error('Tool not found');

    const data = processToolData(toolData);
    if (toolData.validityPeriod !== undefined) {
        const rawVal = existingTool.validityPeriod || '';
        const existingVal = (rawVal && rawVal !== 'N/A')
            ? rawVal
            : (existingTool.customFields?.get?.('validation') || existingTool.customFields?.get?.('validityPeriod') || rawVal);
        data.validityPeriod = addValidityPeriods(existingVal, toolData.validityPeriod);
    }

    // Merge existing tool record with new data to check if toolId prefix or full toolId changes
    const existingObj = existingTool.toObject();
    const mergedCustomFields = {
        ...(existingObj.customFields || {}),
        ...(data.customFields || {})
    };
    const mergedToolData = {
        ...existingObj,
        ...data,
        customFields: mergedCustomFields
    };

    const serialNum = existingTool.serialNumber || 1;
    const oldToolId = existingTool.toolId;
    const newToolId = ToolIdGenerator.generateToolId(mergedToolData, serialNum);
    const newQrLink = ToolIdGenerator.generateQrLink(newToolId);

    data.toolId = newToolId;
    data.qrLink = newQrLink;

    const tool = await Tool.findByIdAndUpdate(existingTool._id, data, { new: true, runValidators: true });
    if (!tool) throw new Error('Tool not found');

    if (oldToolId && oldToolId !== newToolId) {
        await syncToolIdReferences(tool._id, oldToolId, newToolId);
    }

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
        if (tool.toolId && !tool.toolId.startsWith('__TRASHED_')) {
            tool.toolId = `__TRASHED_${tool._id}_${tool.toolId}`;
        }
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

    const deleteOps = [];
    for (const tool of toolsToDelete) {
        targetToolIds.push(tool.toolId || tool._id.toString());
        const originalSerial = tool.originalSerialNumber || tool.serialNumber;

        if (tool.isPrinted) {
            // Move printed tool to Scrap - DO NOT resequence
            deleteOps.push({
                updateOne: {
                    filter: { _id: tool._id },
                    update: {
                        $set: {
                            originalSerialNumber: originalSerial,
                            isDeleted: true,
                            isScrapped: true,
                            status: 'Scrapped',
                            scrappedAt: new Date(),
                            scrappedBy: userInfo
                        }
                    }
                }
            });
        } else {
            // Soft delete unprinted tool to Trash - WILL resequence
            const trashedId = (tool.toolId && !tool.toolId.startsWith('__TRASHED_'))
                ? `__TRASHED_${tool._id}_${tool.toolId}`
                : tool.toolId;

            deleteOps.push({
                updateOne: {
                    filter: { _id: tool._id },
                    update: {
                        $set: {
                            originalSerialNumber: originalSerial,
                            isDeleted: true,
                            isScrapped: false,
                            status: 'Deleted',
                            deletedAt: new Date(),
                            deletedBy: userInfo,
                            toolId: trashedId
                        }
                    }
                }
            });

            if (tool.project) affectedProjectIds.add(tool.project.toString());
            else if (tool.currentSite) affectedProjectIds.add(tool.currentSite.toString());
        }
    }

    if (deleteOps.length > 0) {
        await Tool.bulkWrite(deleteOps, { ordered: false });
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

const bulkScrapTools = async ({ toolIds, reason = '', user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Please select at least one tool to scrap');
    }

    const tools = await Tool.find({ _id: { $in: toolIds } });
    if (!tools || tools.length === 0) {
        throw new Error('No tools found for the selected IDs');
    }

    // Validation 1: All tools must be printed before moving to Scrap
    const unprinted = tools.filter(t => !t.isPrinted);
    if (unprinted.length > 0) {
        const labels = unprinted.map(t => t.toolId || t._id).join(', ');
        throw new Error(`Tool(s) [${labels}] must be marked as Printed before moving to Scrap`);
    }

    // Validation 2: Cannot scrap tools that are already scrapped or disposed
    const alreadyScrapped = tools.filter(t => t.isScrapped || t.isDisposed);
    if (alreadyScrapped.length > 0) {
        const labels = alreadyScrapped.map(t => t.toolId || t._id).join(', ');
        throw new Error(`Tool(s) [${labels}] are already marked as Scrapped or Disposed`);
    }

    // Validation 3: Cannot scrap tools that are currently Moving
    const movingTools = tools.filter(t => ['moving', 'in transit', 'transit'].includes((t.status || '').toLowerCase()));
    if (movingTools.length > 0) {
        const labels = movingTools.map(t => t.toolId || t._id).join(', ');
        throw new Error(`Cannot scrap tool(s) [${labels}] because they are currently in transit / moving`);
    }

    const userInfo = {
        _id: user?._id || null,
        name: user?.name || user?.username || 'System User',
        email: user?.email || 'system@landt.com'
    };

    const targetToolIds = [];
    const now = new Date();

    for (const tool of tools) {
        targetToolIds.push(tool.toolId || tool._id.toString());
        tool.status = 'Scrapped';
        tool.isScrapped = true;
        tool.isDisposed = false;
        tool.scrappedAt = now;
        tool.scrappedBy = userInfo;
        tool.scrapReason = reason || 'Marked as Scrap';
        // Project and store associations remain untouched
        await tool.save();
    }

    const auditLog = new ToolAuditLog({
        user: userInfo,
        dateTime: now,
        action: 'Move Tools to Scrap',
        store: tools[0]?.currentSite || tools[0]?.store,
        affectedToolsCount: tools.length,
        toolIds: targetToolIds,
        remarks: reason ? `Moved ${tools.length} tool(s) to Scrap: ${reason}` : `Moved ${tools.length} tool(s) to Scrap`
    });
    await auditLog.save();

    return {
        count: tools.length,
        message: `${tools.length} tool(s) moved to Scrap successfully`
    };
};

const getScrappedTools = async (params = {}) => {
    const { page = 1, limit = 10, search = '', storeId, projectId, disposalStatus = 'pending', sortBy = 'scrappedAt', sortOrder = 'desc' } = params;
    const query = { isScrapped: true };

    if (disposalStatus === 'pending') {
        query.isDisposed = { $ne: true };
    } else if (disposalStatus === 'disposed') {
        query.isDisposed = true;
    } // if 'all', match both pending and disposed

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
            .populate('scrapDealer', 'name code vendorCode contactPerson')
            .populate('disposalChallanId', 'challanNumber challanDate')
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

const unmarkToolsAsPrinted = async ({ toolIds, user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Specific tool IDs must be selected to unmark as printed');
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
                isPrinted: false,
                printedAt: null,
                printedBy: null
            }
        }
    );

    const auditLog = new ToolAuditLog({
        user: userInfo,
        dateTime: new Date(),
        action: 'Unmark Tools Printed',
        affectedToolsCount: result.modifiedCount,
        toolIds,
        remarks: `Unmarked ${result.modifiedCount} tools as Printed (reverted to Not Printed)`
    });
    await auditLog.save();

    return { count: result.modifiedCount };
};

const restoreToolById = async (id, user = {}) => {
    const tool = await Tool.findById(id);
    if (!tool) throw new Error('Tool not found');

    if (tool.isDisposed) {
        throw new Error('Cannot restore tool that has already been disposed via a Delivery Challan');
    }

    if (!tool.isDeleted && !tool.isScrapped) {
        return tool; // Already active
    }

    const wasUnprinted = !tool.isPrinted;

    // Use temporary toolId to guarantee no E11000 index collision during un-deletion
    if (wasUnprinted && tool.toolId && !tool.toolId.startsWith('__RESTORE_TEMP_')) {
        tool.toolId = `__RESTORE_TEMP_${tool._id}_${Date.now()}`;
    } else if (tool.toolId && tool.toolId.startsWith('__TRASHED_')) {
        tool.toolId = tool.toolId.replace(/^__TRASHED_[^_]+_/, '');
    }

    tool.isDeleted = false;
    tool.isScrapped = false;
    tool.isDisposed = false;
    tool.disposedAt = null;
    tool.disposalChallanId = null;
    tool.disposalChallanNumber = '';
    tool.scrapDealer = null;
    tool.status = 'Available';
    tool.deletedAt = null;
    tool.deletedBy = null;
    tool.scrappedAt = null;
    tool.scrappedBy = null;
    await tool.save();

    const projId = tool.project || tool.currentSite;
    if (projId) {
        await resequenceProjectToolSerials(projId);
    }

    const updatedTool = await Tool.findById(tool._id).populate('project').populate('currentSite').lean();

    const auditLog = new ToolAuditLog({
        user: {
            _id: user?._id,
            name: user?.name || user?.username || 'System User',
            email: user?.email || 'system@landt.com'
        },
        dateTime: new Date(),
        action: 'Restore Tool',
        store: updatedTool.currentSite || updatedTool.store,
        affectedToolsCount: 1,
        toolIds: [updatedTool.toolId],
        remarks: `Restored tool ${updatedTool.toolId}`
    });
    await auditLog.save();

    return updatedTool;
};

const bulkRestoreTools = async ({ toolIds, user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Specific tool IDs must be selected for bulk restore');
    }

    const hasDisposed = await Tool.countDocuments({ _id: { $in: toolIds }, isDisposed: true });
    if (hasDisposed > 0) {
        throw new Error('One or more selected tools have already been disposed via a Delivery Challan and cannot be restored');
    }

    const toolsToRestore = await Tool.find({
        _id: { $in: toolIds },
        $or: [{ isDeleted: true }, { isScrapped: true }]
    });

    if (!toolsToRestore || toolsToRestore.length === 0) {
        return { count: 0, message: 'No deleted or scrapped tools found to restore' };
    }

    const affectedProjectIds = new Set();

    const restoreOps = [];
    for (const tool of toolsToRestore) {
        const wasUnprinted = !tool.isPrinted;
        let restoredToolId = tool.toolId;

        // Use temporary toolId to guarantee no E11000 index collision during un-deletion
        if (wasUnprinted && tool.toolId && !tool.toolId.startsWith('__RESTORE_TEMP_')) {
            restoredToolId = `__RESTORE_TEMP_${tool._id}_${Date.now()}`;
        } else if (tool.toolId && tool.toolId.startsWith('__TRASHED_')) {
            restoredToolId = tool.toolId.replace(/^__TRASHED_[^_]+_/, '');
        }

        restoreOps.push({
            updateOne: {
                filter: { _id: tool._id },
                update: {
                    $set: {
                        toolId: restoredToolId,
                        isDeleted: false,
                        isScrapped: false,
                        status: 'Available',
                        deletedAt: null,
                        deletedBy: null,
                        scrappedAt: null,
                        scrappedBy: null
                    }
                }
            }
        });

        if (tool.project) affectedProjectIds.add(tool.project.toString());
        else if (tool.currentSite) affectedProjectIds.add(tool.currentSite.toString());
    }

    if (restoreOps.length > 0) {
        await Tool.bulkWrite(restoreOps, { ordered: false });
    }

    for (const projId of affectedProjectIds) {
        await resequenceProjectToolSerials(projId);
    }

    const restoredTools = await Tool.find({ _id: { $in: toolIds } }).select('toolId').lean();
    const targetToolIds = restoredTools.map(t => t.toolId || t._id.toString());

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
        'validation': (() => {
            const raw = (t.validityPeriod && t.validityPeriod !== 'N/A')
                ? t.validityPeriod
                : (t.customFields?.validation || t.customFields?.validityPeriod || t.validityPeriod || '');
            if (raw && String(raw).trim() !== '') return raw;
            const purchaser = (t.purchaserName || t.customFields?.purchaserName || '').trim().toLowerCase();
            return (purchaser === 'third party inspection' || purchaser.includes('third party inspection')) ? '1 Year' : '3 Years';
        })(),
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

const getToolById = async (id, storeId = null, projectId = null) => {
    if (!id) return null;
    const rawStr = String(id).trim();
    if (!rawStr) return null;

    const escaped = rawStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. If valid Mongo ObjectId, try direct lookup by _id first
    if (mongoose.Types.ObjectId.isValid(rawStr) && String(new mongoose.Types.ObjectId(rawStr)) === rawStr) {
        const query = { _id: rawStr, isDeleted: { $ne: true } };
        if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
            query.$or = [{ currentSite: storeId }, { store: storeId }];
        }
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            query.project = projectId;
        }
        const toolById = await Tool.findOne(query).populate('project').populate('currentSite').lean();
        if (toolById) return toolById;
    }

    // 2. Build search conditions (exact, suffix/serial, numeric serial)
    const searchConditions = [
        { toolId: { $regex: `^${escaped}$`, $options: 'i' } },
        { toolCode: { $regex: `^${escaped}$`, $options: 'i' } },
        { toolId: { $regex: `${escaped}$`, $options: 'i' } },
        { toolCode: { $regex: `${escaped}$`, $options: 'i' } }
    ];

    if (rawStr.length >= 3) {
        searchConditions.push({ toolId: { $regex: escaped, $options: 'i' } });
    }

    const numVal = parseInt(rawStr, 10);
    if (!isNaN(numVal) && numVal > 0 && /^\d+$/.test(rawStr)) {
        searchConditions.push({ serialNumber: numVal });
        searchConditions.push({ originalSerialNumber: numVal });
    }

    const andConditions = [
        { $or: searchConditions },
        { isDeleted: { $ne: true } }
    ];

    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
        andConditions.push({
            $or: [
                { currentSite: storeId },
                { store: storeId }
            ]
        });
    }

    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
        andConditions.push({ project: projectId });
    }

    const candidates = await Tool.find({ $and: andConditions }).populate('project').populate('currentSite').lean();
    if (!candidates || candidates.length === 0) return null;

    const lowerRaw = rawStr.toLowerCase();

    // Prioritize exact match
    const exactMatch = candidates.find(t => 
        (t.toolId && t.toolId.toLowerCase() === lowerRaw) || 
        (t.toolCode && t.toolCode.toLowerCase() === lowerRaw)
    );
    if (exactMatch) return exactMatch;

    // Prioritize suffix match (e.g., '0001' matches 'SSSSOP0050825UE0001')
    const suffixMatch = candidates.find(t => 
        (t.toolId && t.toolId.toLowerCase().endsWith(lowerRaw)) || 
        (t.toolCode && t.toolCode.toLowerCase().endsWith(lowerRaw))
    );
    if (suffixMatch) return suffixMatch;

    // Prioritize serial number match
    if (!isNaN(numVal)) {
        const serialMatch = candidates.find(t => t.serialNumber === numVal || t.originalSerialNumber === numVal);
        if (serialMatch) return serialMatch;
    }

    return candidates[0];
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

        const oldToolId = tool.toolId;
        const serialNum = tool.serialNumber || 1;
        const newToolId = ToolIdGenerator.generateToolId(tool, serialNum);
        const newQrLink = ToolIdGenerator.generateQrLink(newToolId);

        if (oldToolId !== newToolId) {
            tool.toolId = newToolId;
            tool.qrLink = newQrLink;
        }

        snapshots.push({
            toolId: tool.toolId || tool._id.toString(),
            _id: tool._id,
            oldValues,
            newValues
        });

        await tool.save();

        if (oldToolId && oldToolId !== newToolId) {
            await syncToolIdReferences(tool._id, oldToolId, newToolId);
        }
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

    const unprintedTools = toolsToTransfer.filter(t => !t.isPrinted);
    if (unprintedTools.length > 0) {
        const unprintedLabels = unprintedTools.map(t => t.toolId || t.toolCode || t.description || t._id.toString()).join(', ');
        throw new Error(`Cannot transfer tools: Tool(s) [${unprintedLabels}] are not marked as Printed. All selected tools must be printed before performing an inter-store Transfer.`);
    }

    const { createStoreTransferChallan } = await import('./challan.service.js');
    const transferChallan = await createStoreTransferChallan({
        sourceStore: {
            _id: sourceStore._id,
            name: sourceStore.name,
            storeCode: sourceStore.storeCode || '',
            location: sourceStore.location || ''
        },
        destinationStore: {
            _id: destinationStore._id,
            name: destinationStore.name,
            storeCode: destinationStore.storeCode || '',
            location: destinationStore.location || ''
        },
        project: {
            _id: sourceStore.project?._id || sourceStore.project,
            name: sourceStore.project?.name || '',
            projectCode: sourceStore.project?.projectCode || ''
        },
        items: toolsToTransfer.map(t => ({
            _id: t._id,
            toolId: t.toolId || t._id.toString(),
            description: t.description || '',
            toolCode: t.toolCode || '',
            category: t.toolType || t.category || '',
            capacity: t.capacity || '',
            safeWorkingLoad: t.safeWorkingLoad || '',
            serialNumber: t.serialNumber || '',
            makeYear: t.makeYear || '',
            remarks: t.remarks || ''
        })),
        remarks
    }, user);

    const transferRef = transferChallan.challanNumber;
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
        challan: transferChallan,
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
    unmarkToolsAsPrinted,
    restoreToolById,
    bulkRestoreTools,
    permanentDeleteToolById,
    bulkPermanentDeleteTools,
    exportToolsByStoreId,
    getToolById,
    getToolFilterOptions,
    bulkEditTools,
    transferTools,
    syncToolIdReferences,
    bulkScrapTools
};


