
import mongoose from 'mongoose';
import { Tool } from '../models/tool.model.js';
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
        query.toolType = params.category;
    }

    if (params.status && params.status !== 'All') {
        query.status = params.status;
    }

    const filterFields = [
        'description', 'toolId', 'toolCode', 'toolType', 'status', 'makeYear',
        'capacity', 'safeWorkingLoad', 'metalType', 'toolVariant',
        'dateOfSupply', 'validityPeriod', 'purchaserName', 'purchaserContact',
        'supplierCode', 'jobCode', 'remarks'
    ];

    for (const field of filterFields) {
        const val = params[field];
        if (val && val !== 'All' && val !== '' && val !== undefined) {
            query[field] = { $regex: val, $options: 'i' };
        }
    }
};

const getToolsByStoreId = async (storeId, params = {}) => {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const query = {
        $or: [
            { currentSite: storeId },
            { store: storeId }
        ]
    };
    
    applyAdvancedFilters(query, params);
    
    const sort = {};
    if (sortBy) {
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
    const tool = new Tool(data);
    await tool.save();
    return tool;
};

const updateToolById = async (id, toolData) => {
    const data = processToolData(toolData);
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
        'description': t.description,
        'tool_code': t.toolCode || '',
        'make': t.makeYear,
        'capacity': t.capacity,
        'safe_working_load': t.safeWorkingLoad,
        'purchaser_name': t.purchaserName,
        'supplier_code': t.supplierCode,
        'date_of_supply': t.dateOfSupply,
        'tool_type': t.toolType,
        'metal_type': t.metalType,
        'tool_varient': t.toolVariant,
        'purchaser_contact': t.purchaserContact,
        'job_code': t.jobCode,
        'job_description': t.jobDescription,
        'current_site': t.currentSite ? t.currentSite.location : '',
        'tool id creation': t.toolId,
        'QR LINK ': t.qrLink
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
    await Promise.all(fields.map(async (field) => {
        const values = await Tool.distinct(field, { currentSite: storeId });
        options[field] = values
            .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
            .map(String)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }));
    return options;
};

export const toolService = {
    getToolsByStoreId,
    createToolInStore,
    updateToolById,
    deleteToolById,
    exportToolsByStoreId,
    getToolById,
    getToolFilterOptions
};

