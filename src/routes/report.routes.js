import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';

const router = Router();

router.get('/delivery-challans', reportController.getDeliveryChallanReport);
router.get('/return-challans', reportController.getReturnChallanReport);
router.get('/missing-tools', reportController.getMissingToolsReport);
router.get('/tool-movements', reportController.getToolMovementReport);
router.get('/audit-logs', reportController.getAuditLogsReport);
router.get('/export', reportController.exportReport);

export default router;
