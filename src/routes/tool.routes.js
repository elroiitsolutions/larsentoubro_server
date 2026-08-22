import express from 'express';
import { getToolById, updateToolById, deleteToolById, bulkEditTools } from '../controllers/tool.controller.js';

const router = express.Router();

// Top-level Tool Resource Endpoints (/api/tools/:toolId)
router.post('/bulk-edit', bulkEditTools);
router.get('/:toolId', getToolById);
router.put('/:toolId', updateToolById);
router.delete('/:toolId', deleteToolById);

export default router;
