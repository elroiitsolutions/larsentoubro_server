import * as reportService from '../services/report.service.js';

/**
 * [SHARED] Statutory Registers, Compliance & Audit Report Controller
 * Consumed by both Web Application (report.service.ts) and Mobile App (reportService.ts).
 */

/**
 * [SHARED] getToolsReport - Tools Master Register report data
 */
export const getToolsReport = async (req, res, next) => {
    try {
        const result = await reportService.getToolsReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getChallansReport - Delivery & Return Challans Register report data
 */
export const getChallansReport = async (req, res, next) => {
    try {
        const result = await reportService.getChallansReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getMissingToolsReport - Loss & Missing Tools Register report data
 */
export const getMissingToolsReport = async (req, res, next) => {
    try {
        const result = await reportService.getMissingToolsReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getInspectionsReport - Statutory Inspections & Compliance report data
 */
export const getInspectionsReport = async (req, res, next) => {
    try {
        const result = await reportService.getInspectionsReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getScrapReport - Scrap & Asset Disposal Register report data
 */
export const getScrapReport = async (req, res, next) => {
    try {
        const result = await reportService.getScrapReport(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getSubcontractorsReport - Subcontractor Custody Ledger report data
 */
export const getSubcontractorsReport = async (req, res, next) => {
    try {
        const result = await reportService.getSubcontractorsReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] exportReport - Generate and stream report binary in Excel or CSV format
 */
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

/**
 * [SHARED] getLoginReport - Admin Login Activity & Audit Trail report data
 */
export const getLoginReport = async (req, res, next) => {
    try {
        const result = await reportService.getLoginReport(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] exportLoginReport - Export Admin Login Activity & Audit Trail to Excel or CSV
 */
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
