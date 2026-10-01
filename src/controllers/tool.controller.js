import mongoose from 'mongoose';
import { toolService } from '../services/tool.service.js';
import { getVendorAssignedScope } from '../utils/vendorScope.js';
import { Tool } from '../models/tool.model.js';

export const lookupToolValidity = async (req, res, next) => {
    try {
        const rawCode = (req.query.code || req.query.toolId || req.query.qrCode || req.body.code || '').trim();
        if (!rawCode) {
            return res.status(400).json({
                success: false,
                message: 'QR Code or Tool ID parameter is required.'
            });
        }

        // Extract identifier if full URL was passed
        let cleanedCode = rawCode;
        if (rawCode.includes('/vt/')) {
            cleanedCode = rawCode.split('/vt/').pop()?.split('?')[0] || rawCode;
        } else if (rawCode.includes('/')) {
            cleanedCode = rawCode.split('/').pop()?.split('?')[0] || rawCode;
        }
        cleanedCode = decodeURIComponent(cleanedCode).trim();

        const searchConditions = [
            { toolId: { $regex: `^${cleanedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
            { toolCode: { $regex: `^${cleanedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
            { qrLink: { $regex: cleanedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
        ];

        if (mongoose.Types.ObjectId.isValid(cleanedCode)) {
            searchConditions.push({ _id: cleanedCode });
        }

        const tool = await Tool.findOne({
            $or: searchConditions,
            isDeleted: { $ne: true }
        })
        .populate('project', 'name code')
        .populate('currentSite', 'name siteName code');

        if (!tool) {
            return res.status(404).json({
                success: false,
                status: 'NOT_FOUND',
                message: 'Invalid QR code or Tool Not Found.'
            });
        }

        // Compute Expiry Date & Validity Status on Server-Side
        const validityInfo = computeToolValidityAndStatus(tool);

        const projectVal = tool.project?.name || tool.project?.code || 'N/A';
        const storeVal = tool.currentSite?.name || tool.currentSite?.siteName || tool.currentSite?.code || 'N/A';

        // Return Sanitized Tool Details ONLY (Prevent exposure of sensitive internal fields)
        return res.status(200).json({
            success: true,
            data: {
                toolId: tool.toolId || tool.toolCode || String(tool._id),
                description: tool.description || 'Tool',
                project: projectVal,
                store: storeVal,
                expiryDate: validityInfo.expiryDateFormatted,
                validityStatus: validityInfo.validityStatus,
                validityLabel: validityInfo.validityLabel,
                isValid: validityInfo.isValid,
                status: tool.status || 'Available'
            }
        });
    } catch (error) {
        next(error);
    }
};

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

export const unmarkToolsAsPrinted = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Vendor') {
            return res.status(403).json({ success: false, message: 'Access denied. Vendors cannot modify print status.' });
        }
        const { toolIds } = req.body;
        const result = await toolService.unmarkToolsAsPrinted({
            toolIds,
            user: req.user
        });
        res.status(200).json({ success: true, message: `Successfully unmarked ${result.count} tools as Printed`, data: result });
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

export const parseFlexibleDate = (raw) => {
    if (!raw) return null;
    if (raw instanceof Date) {
        return isNaN(raw.getTime()) ? null : raw;
    }

    let str = String(raw).trim();
    if (!str || str === 'N/A' || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
        return null;
    }

    // Check numeric Excel serial number (e.g. 46165)
    if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 100000 && !str.includes('/') && !str.includes('-')) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dateObj = new Date(excelEpoch.getTime() + Number(str) * 86400000);
        if (!isNaN(dateObj.getTime())) {
            return dateObj;
        }
    }

    // Handle string with Excel serial number in year slot e.g. "1/1/46165"
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
            const yearNum = Number(parts[2]);
            if (!isNaN(yearNum) && yearNum > 30000 && yearNum < 100000) {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const dateObj = new Date(excelEpoch.getTime() + yearNum * 86400000);
                if (!isNaN(dateObj.getTime())) {
                    return dateObj;
                }
            }
        }
    }

    // Standard ISO format (e.g. "2024-05-15T00:00:00.000Z" or "2024-05-15")
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    // Split on delimiters /, -, .
    const parts = str.split(/[\/\-\.]/);
    if (parts.length === 3) {
        let p0 = parseInt(parts[0], 10);
        let p1 = parseInt(parts[1], 10);
        let p2 = parseInt(parts[2], 10);

        if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
            // YYYY-MM-DD
            if (p0 >= 1970 && p0 <= 2100) {
                const d = new Date(p0, p1 - 1, p2);
                if (!isNaN(d.getTime())) return d;
            }
            // DD/MM/YYYY or MM/DD/YYYY
            if (p2 >= 1970 && p2 <= 2100) {
                if (p0 > 12) {
                    // p0 is Day, p1 is Month
                    const d = new Date(p2, p1 - 1, p0);
                    if (!isNaN(d.getTime())) return d;
                }
                if (p1 > 12) {
                    // p1 is Day, p0 is Month
                    const d = new Date(p2, p0 - 1, p1);
                    if (!isNaN(d.getTime())) return d;
                }
                // Default DD/MM/YYYY
                const d = new Date(p2, p1 - 1, p0);
                if (!isNaN(d.getTime())) return d;
            }
        }
    }

    // General fallback Date parse
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) {
        const y = fallback.getFullYear();
        if (y >= 1970 && y <= 2100) {
            return fallback;
        }
    }

    return null;
};

export const computeToolValidityAndStatus = (tool) => {
    // 1. Check explicit nextInspectionDueDate
    let expiryDateObj = parseFlexibleDate(tool.nextInspectionDueDate);

    // 2. Resolve start date (validationStartDate -> dateOfSupply -> createdAt)
    let startDateObj = parseFlexibleDate(tool.validationStartDate || tool.customFields?.validationStartDate);
    if (!startDateObj) {
        startDateObj = parseFlexibleDate(tool.dateOfSupply || tool.customFields?.dateOfSupply);
    }
    if (!startDateObj && tool.createdAt) {
        startDateObj = parseFlexibleDate(tool.createdAt);
    }

    // 3. Resolve validation period (1 Year or 3 Years)
    let rawValidity = tool.validityPeriod || tool.validation || tool.customFields?.validation || tool.customFields?.validityPeriod;
    if (!rawValidity || rawValidity === 'N/A' || String(rawValidity).trim() === '' || String(rawValidity).trim() === '-') {
        const purchaserStr = (tool.purchaserName || tool.customFields?.purchaserName || '').trim().toLowerCase();
        if (purchaserStr === 'third party inspection' || purchaserStr.includes('third party inspection')) {
            rawValidity = '1 Year';
        } else {
            rawValidity = '3 Years';
        }
    }

    let years = 3;
    const yearsMatch = String(rawValidity).match(/(\d+)/);
    if (yearsMatch) {
        years = parseInt(yearsMatch[1], 10);
    } else {
        const purchaserStr = (tool.purchaserName || tool.customFields?.purchaserName || '').trim().toLowerCase();
        if (purchaserStr === 'third party inspection' || purchaserStr.includes('third party inspection')) {
            years = 1;
        }
    }

    if (!expiryDateObj && startDateObj) {
        const computed = new Date(startDateObj);
        computed.setFullYear(computed.getFullYear() + years);
        expiryDateObj = computed;
    }

    if (!expiryDateObj) {
        return {
            validityStatus: 'INVALID_EXPIRY',
            validityLabel: 'No Expiry Date',
            isValid: false,
            expiryDateFormatted: 'Date Missing or Unconfigured'
        };
    }

    const yyyy = expiryDateObj.getFullYear();
    const mm = String(expiryDateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(expiryDateObj.getDate()).padStart(2, '0');
    const expiryDateFormatted = `${yyyy}-${mm}-${dd}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkDate = new Date(expiryDateObj);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate >= today) {
        return {
            validityStatus: 'VALID',
            validityLabel: 'Valid',
            isValid: true,
            expiryDateFormatted
        };
    } else {
        return {
            validityStatus: 'EXPIRED',
            validityLabel: 'Expired',
            isValid: false,
            expiryDateFormatted
        };
    }
};

