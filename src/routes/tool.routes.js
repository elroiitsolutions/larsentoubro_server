import express from 'express';
import {
    getToolById,
    updateToolById,
    deleteToolById,
    bulkEditTools,
    bulkDeleteTools,
    getDeletedTools,
    getScrappedTools,
    bulkScrapTools,
    markToolsAsPrinted,
    unmarkToolsAsPrinted,
    restoreToolById,
    bulkRestoreTools,
    permanentDeleteToolById,
    bulkPermanentDeleteTools,
    transferTools,
    lookupToolValidity,
    inspectTools
} from '../controllers/tool.controller.js';
import { authenticate, requireAdmin, requireInspectionPermission, restrictInspectionUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

// Tool Validity Lookup (Requires JWT Authentication - Guest or User)
router.get('/lookup-validity', lookupToolValidity);

// Static Trash, Scrap, Print & Bulk Endpoints
router.get('/trash', requireAdmin, getDeletedTools);
router.get('/scrap', getScrappedTools);
router.post('/inspect', requireInspectionPermission, inspectTools);
router.post('/bulk-scrap', restrictInspectionUser('scrapping tools directly'), bulkScrapTools);
router.post('/scrap', restrictInspectionUser('scrapping tools directly'), bulkScrapTools);
router.post('/mark-printed', restrictInspectionUser('marking tools as printed'), markToolsAsPrinted);
router.post('/unmark-printed', restrictInspectionUser('unmarking tools as printed'), unmarkToolsAsPrinted);
router.post('/bulk-delete', requireAdmin, bulkDeleteTools);
router.post('/bulk-restore', requireAdmin, bulkRestoreTools);
router.post('/bulk-permanent-delete', requireAdmin, bulkPermanentDeleteTools);
router.post('/bulk-edit', requireAdmin, bulkEditTools);
router.post('/transfer', restrictInspectionUser('transferring tools'), transferTools);

// Dynamic Tool Parameter Endpoints (:toolId)
router.post('/:toolId/restore', requireAdmin, restoreToolById);
router.delete('/:toolId/permanent', requireAdmin, permanentDeleteToolById);
router.get('/:toolId', getToolById);
router.put('/:toolId', requireAdmin, updateToolById);
router.delete('/:toolId', requireAdmin, deleteToolById);

export default router;
