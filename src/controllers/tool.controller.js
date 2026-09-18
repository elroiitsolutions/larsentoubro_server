import { toolService } from '../services/tool.service.js';
import { getVendorAssignedScope } from '../utils/vendorScope.js';

const verifyStoreAccess = (req, storeId) => {
    if (req.user && req.user.role !== 'Admin' && req.user.role !== 'Vendor') {
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
        const queryParams = { ...req.query };

        if (req.user && req.user.role === 'Vendor') {
            const scope = await getVendorAssignedScope(req.user);
            if (!scope.assignedStoreIds.includes(storeId.toString())) {
                return res.status(403).json({ success: false, message: 'Access denied. You do not have Delivery Challan assignments for this store.' });
            }
            queryParams.assignedToolIds = scope.assignedToolObjectIds;
        } else if (!verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }

        const result = await toolService.getToolsByStoreId(storeId, queryParams);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const exportToolsByStoreId = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        const queryParams = { ...req.query };

        if (req.user && req.user.role === 'Vendor') {
            const scope = await getVendorAssignedScope(req.user);
            if (!scope.assignedStoreIds.includes(storeId.toString())) {
                return res.status(403).json({ success: false, message: 'Access denied. You do not have Delivery Challan assignments for this store.' });
            }
            queryParams.assignedToolIds = scope.assignedToolObjectIds;
        } else if (!verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }

        const { exportType = 'excel' } = req.query;
        const buffer = await toolService.exportToolsByStoreId(storeId, queryParams);
        
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
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot create tools.' });
        }
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
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot modify tool master records.' });
        }
        const { toolId } = req.params;
        const result = await toolService.updateToolById(toolId, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

export const deleteToolById = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot delete tools.' });
        }
        const { toolId } = req.params;
        if (toolId === 'bulk-delete') {
            return bulkDeleteTools(req, res, next);
        }
        const result = await toolService.deleteToolById(toolId, req.user);
        res.status(200).json({ success: true, message: 'Tool moved to Trash', data: result });
    } catch (error) {
        next(error);
    }
};

export const bulkDeleteTools = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot delete tools.' });
        }
        const { storeId } = req.params;
        if (storeId && !verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }
        const { toolIds } = req.body;
        const result = await toolService.bulkDeleteTools({
            storeId,
            toolIds,
            user: req.user
        });
        res.status(200).json({ success: true, message: `Successfully deleted ${result.count} tools`, data: result });
    } catch (error) {
        next(error);
    }
};

export const getDeletedTools = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        const result = await toolService.getDeletedTools(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getScrappedTools = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        const result = await toolService.getScrappedTools(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const markToolsAsPrinted = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot modify print status.' });
        }
        const { toolIds } = req.body;
        const result = await toolService.markToolsAsPrinted({
            toolIds,
            user: req.user
        });
        res.status(200).json({ success: true, message: `Successfully marked ${result.count} tools as Printed`, data: result });
    } catch (error) {
        next(error);
    }
};

export const restoreToolById = async (req, res, next) => {
    try {
        const { toolId } = req.params;
        if (toolId === 'bulk-restore') {
            return bulkRestoreTools(req, res, next);
        }
        const result = await toolService.restoreToolById(toolId, req.user);
        res.status(200).json({ success: true, message: 'Tool restored successfully', data: result });
    } catch (error) {
        next(error);
    }
};

export const bulkRestoreTools = async (req, res, next) => {
    try {
        const { toolIds } = req.body;
        const result = await toolService.bulkRestoreTools({
            toolIds,
            user: req.user
        });
        res.status(200).json({ success: true, message: `Successfully restored ${result.count} tools`, data: result });
    } catch (error) {
        next(error);
    }
};

export const permanentDeleteToolById = async (req, res, next) => {
    try {
        const { toolId } = req.params;
        if (toolId === 'bulk-permanent-delete') {
            return bulkPermanentDeleteTools(req, res, next);
        }
        const result = await toolService.permanentDeleteToolById(toolId, req.user);
        res.status(200).json({ success: true, message: 'Tool permanently deleted', data: result });
    } catch (error) {
        next(error);
    }
};

export const bulkPermanentDeleteTools = async (req, res, next) => {
    try {
        const { toolIds } = req.body;
        const result = await toolService.bulkPermanentDeleteTools({
            toolIds,
            user: req.user
        });
        res.status(200).json({ success: true, message: `Successfully permanently deleted ${result.count} tools`, data: result });
    } catch (error) {
        next(error);
    }
};

export const getToolById = async (req, res, next) => {
    try {
        const toolId = decodeURIComponent(req.params.toolId);
        if (toolId === 'trash') {
            return getDeletedTools(req, res, next);
        }

        const result = await toolService.getToolById(toolId);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Tool not found' });
        }

        // Strict authorization check for Vendor logins
        if (req.user && req.user.role === 'Vendor') {
            const scope = await getVendorAssignedScope(req.user);
            const targetIdStr = result._id.toString();
            const targetToolIdCode = result.toolId || '';

            const isAssigned = scope.assignedToolIds.includes(targetIdStr) || 
                               scope.assignedToolIds.includes(targetToolIdCode);

            if (!isAssigned) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. This tool is not assigned to your vendor account via Delivery Challan.'
                });
            }
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

export const bulkEditTools = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot bulk edit tools.' });
        }
        const { storeId } = req.params;
        if (storeId && !verifyStoreAccess(req, storeId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
        }
        const { toolIds, filterCriteria, updates } = req.body;
        const result = await toolService.bulkEditTools({
            storeId,
            toolIds,
            filterCriteria,
            updates,
            user: req.user
        });
        res.status(200).json({ success: true, message: `Successfully updated ${result.count} tools`, data: result });
    } catch (error) {
        next(error);
    }
};

export const transferTools = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot transfer store tools.' });
        }
        const { sourceStoreId, destinationStoreId, toolIds, remarks } = req.body;
        const sourceId = req.params.storeId || sourceStoreId;

        if (!sourceId || !destinationStoreId) {
            return res.status(400).json({ success: false, message: 'Source store and destination store are required.' });
        }

        if (sourceId && !verifyStoreAccess(req, sourceId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to the source store.' });
        }

        if (destinationStoreId && !verifyStoreAccess(req, destinationStoreId)) {
            return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to the destination store.' });
        }

        const result = await toolService.transferTools({
            sourceStoreId: sourceId,
            destinationStoreId,
            toolIds,
            remarks,
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: `Successfully transferred ${result.count} tools from ${result.sourceStore.name} to ${result.destinationStore.name}`,
            data: result
        });
    } catch (error) {
        next(error);
    }
};
