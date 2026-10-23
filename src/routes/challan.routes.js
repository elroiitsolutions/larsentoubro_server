import { Router } from 'express';
import * as challanController from '../controllers/challan.controller.js';
import { authenticate, restrictInspectionUser } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

/**
 * [SHARED] Challan Management Routes (Delivery, Return & Scrap)
 * Consumed by both Web Application and Mobile App:
 * - Web: client/src/services/challan.service.ts
 * - Mobile: larsentoubro-app/src/features/challans/services/challanService.ts
 */

/**
 * [SHARED] POST /api/challans/delivery - Issue tools via Delivery Challan (DC)
 */
router.post('/delivery', restrictInspectionUser('creating delivery challans'), challanController.createDeliveryChallan);

/**
 * [SHARED] POST /api/challans/scrap-delivery - Issue scrap tools via Scrap Delivery Challan (SDC)
 */
router.post('/scrap-delivery', restrictInspectionUser('creating scrap delivery challans'), challanController.createScrapDeliveryChallan);

/**
 * [SHARED] POST /api/challans/return - Receive tools back via Return Challan (RC)
 */
router.post('/return', challanController.createReturnChallan);

/**
 * [SHARED] GET /api/challans - List challans with search and status filtering
 */
router.get('/', challanController.getChallans);

/**
 * [SHARED] GET /api/challans/:id - Get challan details and tool items by ID
 */
router.get('/:id', challanController.getChallanById);

/**
 * [SHARED] GET /api/challans/:id/pdf - Stream formatted PDF of Delivery/Return Challan
 */
router.get('/:id/pdf', challanController.downloadChallanPdf);

/**
 * [SHARED] PUT /api/challans/:id - Update existing challan details
 */
router.put('/:id', challanController.updateDeliveryChallan);

/**
 * [APP] POST /api/challans/:id/cancel - Cancel active Delivery Challan
 * Exclusively used by Mobile App challan action menu.
 */
router.post('/:id/cancel', challanController.cancelDeliveryChallan);

/**
 * [SHARED] POST /api/challans/log-pdf-download - Record PDF download event in challan history
 */
router.post('/log-pdf-download', challanController.logPdfDownload);

export default router;
