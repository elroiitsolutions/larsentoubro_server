import { Challan } from '../models/challan.model.js';
import { MissingTool } from '../models/missingTool.model.js';
import { ToolMovement } from '../models/toolMovement.model.js';
import { ChallanAuditLog } from '../models/challanAuditLog.model.js';
import * as XLSX from 'xlsx';

const applyDateRange = (query, field, startDate, endDate) => {
    if (startDate || endDate) {
        query[field] = {};
        if (startDate) query[field].$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query[field].$lte = end;
        }
    }
};

export const getDeliveryChallanReport = async (params = {}) => {
    const {
        page = 1,
        limit = 50,
        vendor = 'All',
        status = 'All',
        challanNumber = '',
        startDate,
        endDate
    } = params;

    const query = { challanType: 'Delivery' };

    if (vendor && vendor !== 'All') query['vendor._id'] = vendor;
    if (status && status !== 'All') query.status = status;
    if (challanNumber) query.challanNumber = { $regex: challanNumber, $options: 'i' };
    applyDateRange(query, 'challanDate', startDate, endDate);

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
        Challan.find(query).sort({ challanDate: -1 }).skip(skip).limit(Number(limit)).lean(),
        Challan.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
    };
};

export const getReturnChallanReport = async (params = {}) => {
    const {
        page = 1,
        limit = 50,
        vendor = 'All',
        status = 'All',
        challanNumber = '',
        startDate,
        endDate
    } = params;

    const query = { challanType: 'Return' };

    if (vendor && vendor !== 'All') query['vendor._id'] = vendor;
    if (status && status !== 'All') query.status = status;
    if (challanNumber) query.challanNumber = { $regex: challanNumber, $options: 'i' };
    applyDateRange(query, 'challanDate', startDate, endDate);

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
        Challan.find(query).sort({ challanDate: -1 }).skip(skip).limit(Number(limit)).lean(),
        Challan.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
    };
};

export const getMissingToolsReport = async (params = {}) => {
    const {
        page = 1,
        limit = 50,
        vendor = 'All',
        toolName = '',
        challanNumber = '',
        startDate,
        endDate
    } = params;

    const query = {};

    if (vendor && vendor !== 'All') query.vendor = vendor;
    if (toolName) {
        query.$or = [
            { description: { $regex: toolName, $options: 'i' } },
            { toolIdStr: { $regex: toolName, $options: 'i' } },
            { toolCode: { $regex: toolName, $options: 'i' } }
        ];
    }
    if (challanNumber) {
        query.$or = [
            { dcNumber: { $regex: challanNumber, $options: 'i' } },
            { rcNumber: { $regex: challanNumber, $options: 'i' } }
        ];
    }
    applyDateRange(query, 'missingDate', startDate, endDate);

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
        MissingTool.find(query).sort({ missingDate: -1 }).skip(skip).limit(Number(limit)).lean(),
        MissingTool.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
    };
};

export const getToolMovementReport = async (params = {}) => {
    const {
        page = 1,
        limit = 50,
        toolName = '',
        challanNumber = '',
        movementType = 'All',
        startDate,
        endDate
    } = params;

    const query = {};

    if (movementType && movementType !== 'All') query.movementType = movementType;
    if (toolName) {
        query.$or = [
            { description: { $regex: toolName, $options: 'i' } },
            { toolIdStr: { $regex: toolName, $options: 'i' } }
        ];
    }
    if (challanNumber) query.referenceNumber = { $regex: challanNumber, $options: 'i' };
    applyDateRange(query, 'date', startDate, endDate);

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
        ToolMovement.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
        ToolMovement.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
    };
};

export const getAuditLogsReport = async (params = {}) => {
    const {
        page = 1,
        limit = 50,
        action = 'All',
        referenceNumber = '',
        startDate,
        endDate
    } = params;

    const query = {};

    if (action && action !== 'All') query.action = action;
    if (referenceNumber) query.referenceNumber = { $regex: referenceNumber, $options: 'i' };
    applyDateRange(query, 'dateTime', startDate, endDate);

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
        ChallanAuditLog.find(query).sort({ dateTime: -1 }).skip(skip).limit(Number(limit)).lean(),
        ChallanAuditLog.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
    };
};

export const generateReportExportBuffer = async (reportType, params, exportFormat = 'excel') => {
    let records = [];
    let headers = [];
    let rows = [];

    const exportParams = { ...params, page: 1, limit: 5000 };

    switch (reportType) {
        case 'delivery': {
            const result = await getDeliveryChallanReport(exportParams);
            records = result.data;
            headers = ['DC Number', 'Vendor Name', 'Tool Count', 'Date', 'Status', 'Created By'];
            rows = records.map(r => [
                r.challanNumber,
                r.vendor?.name || '-',
                r.toolCount || 0,
                new Date(r.challanDate).toLocaleDateString(),
                r.status,
                r.createdBy?.name || '-'
            ]);
            break;
        }
        case 'return': {
            const result = await getReturnChallanReport(exportParams);
            records = result.data;
            headers = ['RC Number', 'Reference DC', 'Vendor Name', 'Returned Count', 'Missing Count', 'Date', 'Created By'];
            rows = records.map(r => [
                r.challanNumber,
                r.referenceDcNumber || '-',
                r.vendor?.name || '-',
                r.returnedCount || 0,
                r.missingCount || 0,
                new Date(r.challanDate).toLocaleDateString(),
                r.createdBy?.name || '-'
            ]);
            break;
        }
        case 'missing': {
            const result = await getMissingToolsReport(exportParams);
            records = result.data;
            headers = ['Tool ID', 'Tool Name', 'Tool Code', 'Vendor', 'DC Number', 'RC Number', 'Missing Date', 'Reported By'];
            rows = records.map(r => [
                r.toolIdStr,
                r.description || '-',
                r.toolCode || '-',
                r.vendorName || '-',
                r.dcNumber || '-',
                r.rcNumber || '-',
                new Date(r.missingDate).toLocaleDateString(),
                r.reportedBy || '-'
            ]);
            break;
        }
        case 'movement': {
            const result = await getToolMovementReport(exportParams);
            records = result.data;
            headers = ['Date', 'Tool ID', 'Description', 'Movement Type', 'From', 'To', 'Reference No', 'User'];
            rows = records.map(r => [
                new Date(r.date).toLocaleString(),
                r.toolIdStr,
                r.description || '-',
                r.movementType,
                r.from,
                r.to,
                r.referenceNumber,
                r.user
            ]);
            break;
        }
        case 'audit': {
            const result = await getAuditLogsReport(exportParams);
            records = result.data;
            headers = ['Date Time', 'Action', 'Reference Number', 'User', 'Details'];
            rows = records.map(r => [
                new Date(r.dateTime).toLocaleString(),
                r.action,
                r.referenceNumber,
                r.user?.name || '-',
                r.details || '-'
            ]);
            break;
        }
        default:
            throw new Error('Unknown report type');
    }

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');

    return XLSX.write(wb, {
        type: 'buffer',
        bookType: exportFormat === 'csv' ? 'csv' : 'xlsx'
    });
};
