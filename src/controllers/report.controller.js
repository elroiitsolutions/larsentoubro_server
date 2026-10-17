import * as reportService from '../services/report.service.js';

export const getToolsReport = async (req, res, next) => {
    try {
        const result = await reportService.getToolsReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getChallansReport = async (req, res, next) => {
    try {
        const result = await reportService.getChallansReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getMissingToolsReport = async (req, res, next) => {
    try {
        const result = await reportService.getMissingToolsReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getInspectionsReport = async (req, res, next) => {
    try {
        const result = await reportService.getInspectionsReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getScrapReport = async (req, res, next) => {
    try {
        const result = await reportService.getScrapReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getSubcontractorsReport = async (req, res, next) => {
    try {
        const result = await reportService.getSubcontractorsReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const exportReport = async (req, res, next) => {
    try {
        const { type = 'tools', format = 'excel' } = req.query;
        const buffer = await reportService.generateReportExportBuffer(type, format, req.query, req.user);

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

export const getLoginReport = async (req, res, next) => {
    try {
        const result = await reportService.getLoginReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const exportLoginReport = async (req, res, next) => {
    try {
        const { format = 'excel' } = req.query;
        const buffer = await reportService.generateLoginReportExportBuffer(format, req.query);

        const filename = `login_activity_report_${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'xlsx'}`;
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
