import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * [SHARED] Statutory Registers, Compliance & Audit Report Routes
 * Consumed by both Web Application and Mobile App:
 * - Web: client/src/services/report.service.ts
 * - Mobile: larsentoubro-app/src/features/reports/services/reportService.ts
 */

/**
 * [SHARED] GET /api/reports/tools - Tools Master Register report
 */
router.get('/tools', authenticate, reportController.getToolsReport);

/**
 * [SHARED] GET /api/reports/challans - Delivery & Return Challans Register report
 */
router.get('/challans', authenticate, reportController.getChallansReport);

/**
 * [SHARED] GET /api/reports/missing - Loss & Missing Tools Register report
 */
router.get('/missing', authenticate, reportController.getMissingToolsReport);

/**
 * [SHARED] GET /api/reports/inspections - Third-party Inspections & Statutory Compliance report
 */
router.get('/inspections', authenticate, reportController.getInspectionsReport);

/**
 * [SHARED] GET /api/reports/scrap - Scrap & Asset Disposal Register report
 */
router.get('/scrap', authenticate, reportController.getScrapReport);

/**
 * [SHARED] GET /api/reports/subcontractors - Subcontractor Custody Ledger report
 */
router.get('/subcontractors', authenticate, reportController.getSubcontractorsReport);

/**
 * [SHARED] GET /api/reports/export - Universal Export endpoint (Excel / CSV)
 * Query parameters: type (tools|challans|missing|inspections|scrap|subcontractors), format (excel|csv)
 */
router.get('/export', authenticate, reportController.exportReport);

/**
 * [SHARED] GET /api/reports/logins - Admin Login Activity & Audit Trail report
 */
router.get('/logins', authenticate, requireAdmin, reportController.getLoginReport);

/**
 * [SHARED] GET /api/reports/logins/export - Export Login Activity Audit Trail (Excel / CSV)
 */
router.get('/logins/export', authenticate, requireAdmin, reportController.exportLoginReport);

export default router;
