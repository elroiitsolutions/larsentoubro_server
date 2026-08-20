
import mongoose from 'mongoose';
import { Tool } from '../models/tool.model.js';
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
            query[field] = { $regex: val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        }
    }
};

const getToolsByStoreId = async (storeId, params = {}) => {
    const { page = 1, limit = 10, sortBy = 'serialNumber', sortOrder = 'asc' } = params;
    const query = {
        $or: [
            { currentSite: storeId },
            { store: storeId }
        ]
    };
    
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

const updateToolById = async (id, toolData) => {
    const data = processToolData(toolData);
    delete data.toolId;
    delete data.qrLink;
    const tool = await Tool.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!tool) throw new Error('Tool not found');
    return tool;
};

const deleteToolById = async (id) => {
    const tool = await Tool.findByIdAndDelete(id);
    if (!tool) throw new Error('Tool not found');
    return tool;
};

const exportToolsByStoreId = async (storeId, params = {}) => {
    const { sortBy = 'createdAt', sortOrder = 'desc', exportScope = 'filtered', exportType = 'excel' } = params;
    const query = {
        $or: [
            { currentSite: storeId },
            { store: storeId }
        ]
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
        'validation': t.validityPeriod || t.validation || t.customFields?.validation || '',
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
        ]
    };
    await Promise.all(fields.map(async (field) => {
        const values = await Tool.distinct(field, storeQuery);
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
        _id: { $in: toolIds }
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
    const setFields = {};
    const setCustomFields = {};

    for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === '') continue;
        if (corePaths.includes(key)) {
            setFields[key] = value;
        } else {
            setCustomFields[`customFields.${key}`] = value;
        }
    }

    const updateQueryPayload = { ...setFields, ...setCustomFields };
    if (Object.keys(updateQueryPayload).length === 0) {
        throw new Error('No valid update values provided');
    }

    const snapshots = [];
    const targetToolIds = [];

    for (const tool of toolsToUpdate) {
        targetToolIds.push(tool.toolId || tool._id.toString());
        const oldValues = {};
        const newValues = {};

        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === null || value === '') continue;
            if (corePaths.includes(key)) {
                oldValues[key] = tool[key];
                newValues[key] = value;
            } else {
                oldValues[key] = tool.customFields ? tool.customFields.get(key) : undefined;
                newValues[key] = value;
            }
        }

        snapshots.push({
            toolId: tool.toolId || tool._id.toString(),
            _id: tool._id,
            oldValues,
            newValues
        });
    }

    const matchedIds = toolsToUpdate.map(t => t._id);
    await Tool.updateMany(
        { _id: { $in: matchedIds } },
        { $set: updateQueryPayload },
        { runValidators: true }
    );

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

export const toolService = {
    getToolsByStoreId,
    createToolInStore,
    updateToolById,
    deleteToolById,
    exportToolsByStoreId,
    getToolById,
    getToolFilterOptions,
    bulkEditTools
};


