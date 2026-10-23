import { Router } from 'express';
import * as challanController from '../controllers/challan.controller.js';
import { authenticate, restrictInspectionUser } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.post('/delivery', restrictInspectionUser('creating delivery challans'), challanController.createDeliveryChallan);
router.post('/scrap-delivery', restrictInspectionUser('creating scrap delivery challans'), challanController.createScrapDeliveryChallan);
router.post('/return', challanController.createReturnChallan);
router.get('/', challanController.getChallans);
router.get('/:id', challanController.getChallanById);
router.get('/:id/pdf', challanController.downloadChallanPdf);
router.put('/:id', challanController.updateDeliveryChallan);
router.post('/:id/cancel', challanController.cancelDeliveryChallan);
router.post('/log-pdf-download', challanController.logPdfDownload);

export default router;
