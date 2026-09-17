import express from 'express';
import {
    getToolById,
    updateToolById,
    deleteToolById,
    bulkEditTools,
    bulkDeleteTools,
    getDeletedTools,
    getScrappedTools,
    markToolsAsPrinted,
    restoreToolById,
    bulkRestoreTools,
    permanentDeleteToolById,
    bulkPermanentDeleteTools,
    transferTools
} from '../controllers/tool.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

// Static Trash, Scrap, Print & Bulk Endpoints
router.get('/trash', getDeletedTools);
router.get('/scrap', getScrappedTools);
router.post('/mark-printed', markToolsAsPrinted);
router.post('/bulk-delete', bulkDeleteTools);
router.post('/bulk-restore', bulkRestoreTools);
router.post('/bulk-permanent-delete', requireAdmin, bulkPermanentDeleteTools);
router.post('/bulk-edit', bulkEditTools);
router.post('/transfer', transferTools);

// Dynamic Tool Parameter Endpoints (:toolId)
router.post('/:toolId/restore', restoreToolById);
router.delete('/:toolId/permanent', requireAdmin, permanentDeleteToolById);
router.get('/:toolId', getToolById);
router.put('/:toolId', updateToolById);
router.delete('/:toolId', deleteToolById);

export default router;
