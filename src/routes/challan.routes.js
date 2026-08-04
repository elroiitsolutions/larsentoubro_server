import { Router } from 'express';
import * as challanController from '../controllers/challan.controller.js';

const router = Router();

router.post('/delivery', challanController.createDeliveryChallan);
router.post('/return', challanController.createReturnChallan);
router.get('/', challanController.getChallans);
router.get('/:id', challanController.getChallanById);
router.put('/:id', challanController.updateDeliveryChallan);
router.post('/log-pdf-download', challanController.logPdfDownload);

export default router;
