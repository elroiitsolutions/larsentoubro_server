import * as reportService from '../services/report.service.js';

export const getDeliveryChallanReport = async (req, res, next) => {
    try {
        const result = await reportService.getDeliveryChallanReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getReturnChallanReport = async (req, res, next) => {
    try {
        const result = await reportService.getReturnChallanReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getMissingToolsReport = async (req, res, next) => {
    try {
        const result = await reportService.getMissingToolsReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getToolMovementReport = async (req, res, next) => {
    try {
        const result = await reportService.getToolMovementReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getAuditLogsReport = async (req, res, next) => {
    try {
        const result = await reportService.getAuditLogsReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const exportReport = async (req, res, next) => {
    try {
        const { type = 'delivery', format = 'excel' } = req.query;
        const buffer = await reportService.generateReportExportBuffer(type, req.query, format);

        const filename = `${type}_report_${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'xlsx'}`;
        const contentType = format === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);
        res.send(buffer);
    } catch (error) {
        next(error);
    }
};
