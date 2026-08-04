import { toolService } from '../services/tool.service.js';

const verifyStoreAccess = (req, storeId) => {
    if (req.user && req.user.role !== 'Admin') {
        const assignedStoreIds = (req.user.stores || []).map(s => {
            if (!s) return '';
            if (typeof s === 'object' && s._id) return s._id.toString();
            return s.toString();
        });
        if (!assignedStoreIds.includes(storeId.toString())) {
            return false;
        }
    }
    return true;
};

export const getToolsByStoreId = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        if (!verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }
        const result = await toolService.getToolsByStoreId(storeId, req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const exportToolsByStoreId = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        if (!verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }
        const { exportType = 'excel', exportScope = 'filtered' } = req.query;
        
        const buffer = await toolService.exportToolsByStoreId(storeId, req.query);
        
        if (exportType === 'csv') {
            res.setHeader('Content-Disposition', 'attachment; filename="tools_export.csv"');
            res.setHeader('Content-Type', 'text/csv');
        } else {
            res.setHeader('Content-Disposition', 'attachment; filename="tools_export.xlsx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
        
        res.send(buffer);
    } catch (error) {
        next(error);
    }
};

export const createToolInStore = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        if (!verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }
        const result = await toolService.createToolInStore(req.body);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

export const updateToolById = async (req, res, next) => {
    try {
        const { toolId } = req.params;
        const result = await toolService.updateToolById(toolId, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

export const deleteToolById = async (req, res, next) => {
    try {
        const { toolId } = req.params;
        await toolService.deleteToolById(toolId);
        res.status(200).json({ success: true, message: 'Tool deleted successfully' });
    } catch (error) {
        next(error);
    }
};

export const getToolById = async (req, res, next) => {
    try {
        const toolId = decodeURIComponent(req.params.toolId);
        const result = await toolService.getToolById(toolId);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Tool not found' });
        }
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

export const getToolFilterOptions = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        if (!verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }
        const options = await toolService.getToolFilterOptions(storeId);
        res.status(200).json({ success: true, data: options });
    } catch (error) {
        next(error);
    }
};
