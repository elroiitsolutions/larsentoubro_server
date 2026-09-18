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
router.get('/trash', requireAdmin, getDeletedTools);
router.get('/scrap', getScrappedTools);
router.post('/mark-printed', markToolsAsPrinted);
router.post('/bulk-delete', requireAdmin, bulkDeleteTools);
router.post('/bulk-restore', requireAdmin, bulkRestoreTools);
router.post('/bulk-permanent-delete', requireAdmin, bulkPermanentDeleteTools);
router.post('/bulk-edit', requireAdmin, bulkEditTools);
router.post('/transfer', transferTools);

// Dynamic Tool Parameter Endpoints (:toolId)
router.post('/:toolId/restore', requireAdmin, restoreToolById);
router.delete('/:toolId/permanent', requireAdmin, permanentDeleteToolById);
router.get('/:toolId', getToolById);
router.put('/:toolId', requireAdmin, updateToolById);
router.delete('/:toolId', requireAdmin, deleteToolById);

export default router;
