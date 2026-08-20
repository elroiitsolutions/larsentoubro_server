import * as reportService from '../services/report.service.js';

export const getToolsReport = async (req, res, next) => {
    try {
        const result = await reportService.getToolsReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const exportReport = async (req, res, next) => {
    try {
        const { type = 'tools', format = 'excel' } = req.query;
        const buffer = await reportService.generateReportExportBuffer(type, format, req.query);

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
