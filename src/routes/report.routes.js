import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';

const router = Router();

router.get('/tools', reportController.getToolsReport);
router.get('/export', reportController.exportReport);

export default router;
