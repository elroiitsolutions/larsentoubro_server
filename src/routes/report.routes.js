import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Module Reports
router.get('/tools', authenticate, reportController.getToolsReport);
router.get('/challans', authenticate, reportController.getChallansReport);
router.get('/missing', authenticate, reportController.getMissingToolsReport);
router.get('/inspections', authenticate, reportController.getInspectionsReport);
router.get('/scrap', authenticate, reportController.getScrapReport);
router.get('/subcontractors', authenticate, reportController.getSubcontractorsReport);

// Universal Export endpoint (format=excel|csv, type=tools|challans|missing|inspections|scrap|subcontractors|logins)
router.get('/export', authenticate, reportController.exportReport);

// Admin Login Activity Report endpoints
router.get('/logins', authenticate, requireAdmin, reportController.getLoginReport);
router.get('/logins/export', authenticate, requireAdmin, reportController.exportLoginReport);

export default router;
