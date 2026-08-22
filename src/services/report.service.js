import { Tool } from '../models/tool.model.js';
import ExcelJS from 'exceljs';

/**
 * Helper to apply date range filter
 */
const applyDateRange = (query, dateField, startDate, endDate) => {
    if (startDate || endDate) {
        query[dateField] = {};
        if (startDate) query[dateField].$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query[dateField].$lte = end;
        }
    }
};

/**
 * Helper to apply status filter handling 'Moving' state
 */
const applyStatusFilter = (query, status) => {
    if (status && status !== 'All') {
        if (status === 'Moving') {
            query.status = { $in: ['Moving', 'Issued', 'In Transit'] };
        } else {
            query.status = status;
        }
    }
};

/**
 * 1. Tools Report (Inventory & Inspection Compliance)
 */
export const getToolsReport = async (params = {}) => {
    const {
        page = 1,
        limit = 50,
        project = 'All',
        store = 'All',
        vendor = 'All',
        status = 'All',
        toolType = 'All',
        inspectionStatus = 'All',
        startDate,
        endDate,
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = params;

    const query = {};

    if (project && project !== 'All') query.project = project;
    if (store && store !== 'All') query.currentSite = store;
    if (vendor && vendor !== 'All') {
        query.$or = [
            { supplierCode: vendor },
            { purchaserName: vendor }
        ];
    }
    applyStatusFilter(query, status);
    if (toolType && toolType !== 'All') query.toolType = toolType;
    if (inspectionStatus && inspectionStatus !== 'All') query.inspectionStatus = inspectionStatus;
    applyDateRange(query, 'createdAt', startDate, endDate);

    if (search) {
        query.$or = [
            { toolId: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { toolCode: { $regex: search, $options: 'i' } },
            { subcontractorName: { $regex: search, $options: 'i' } },
            { purchaserName: { $regex: search, $options: 'i' } }
        ];
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    let sortObj = { [sortBy]: sortDir };
    if (sortBy === 'toolId' || sortBy === 'serialNumber') {
        sortObj = { serialNumber: sortDir, toolId: sortDir };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [data, total, summaryAgg] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode')
            .populate('currentSite', 'name type')
            .sort(sortObj)
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        Tool.countDocuments(query),
        Tool.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalTools: { $sum: 1 },
                    availableCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Available'] }, 1, 0] }
                    },
                    issuedCount: {
                        $sum: { $cond: [{ $in: ['$status', ['Issued', 'In Transit', 'Moving']] }, 1, 0] }
                    },
                    overdueCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ifNull: ['$nextInspectionDueDate', false] },
                                        { $lt: ['$nextInspectionDueDate', new Date()] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ])
    ]);

    const summary = summaryAgg[0] || {
        totalTools: total,
        availableCount: 0,
        issuedCount: 0,
        overdueCount: 0
    };

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
        summary
    };
};

/**
 * Generates Excel/CSV Export Buffers for Tools Report
 */
export const generateReportExportBuffer = async (reportType = 'tools', format = 'excel', params = {}) => {
    const res = await getToolsReport({ ...params, page: 1, limit: 10000 });
    const reportData = res.data || [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tools Report');

    sheet.columns = [
        { header: 'Tool ID', key: 'toolId', width: 22 },
        { header: 'Description', key: 'description', width: 35 },
        { header: 'Category', key: 'toolType', width: 20 },
        { header: 'Project', key: 'project', width: 25 },
        { header: 'Current Store', key: 'currentSite', width: 25 },
        { header: 'Vendor', key: 'vendor', width: 25 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Subcontractor', key: 'subcontractorName', width: 25 },
        { header: 'Inspection Status', key: 'inspectionStatus', width: 20 },
        { header: 'Inspection Due Date', key: 'nextInspectionDueDate', width: 20 }
    ];

    reportData.forEach(r => {
        sheet.addRow({
            toolId: r.toolId,
            description: r.description,
            toolType: r.toolType || r.toolVariant || 'General',
            project: r.project?.name || 'Unassigned',
            currentSite: r.currentSite?.name || 'Central Store',
            vendor: r.purchaserName || r.supplierCode || 'N/A',
            status: r.status || 'Available',
            subcontractorName: r.subcontractorName || '-',
            inspectionStatus: r.inspectionStatus || 'Pending',
            nextInspectionDueDate: r.nextInspectionDueDate ? new Date(r.nextInspectionDueDate).toLocaleDateString() : '-'
        });
    });

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1F2937' }
    };

    if (format === 'csv') {
        const csvBuffer = await workbook.csv.writeBuffer();
        return csvBuffer;
    } else {
        const excelBuffer = await workbook.xlsx.writeBuffer();
        return excelBuffer;
    }
};
