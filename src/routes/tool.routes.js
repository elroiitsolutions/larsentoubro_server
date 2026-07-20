import express from 'express';
import { getStoreTools } from '../controllers/tool.controller.js';

const router = express.Router();

router.get('/:storeId/tools', getStoreTools);

export default router;
