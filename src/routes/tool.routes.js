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
    inspectTools,
    getToolsByIds,
    streamDeleteJobProgress,
    getDeleteJobStatus
} from '../controllers/tool.controller.js';
import { authenticate, requireAdmin, requireInspectionPermission, restrictInspectionUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// [APP] Mobile-Exclusive Batch Tool Operations
// ==========================================

/**
 * [APP] POST /api/tools/batch-get - Batch retrieve tools by an array of IDs
 * Exclusively consumed by Mobile App (larsentoubro-app/src/features/tools/services/toolService.ts).
 */
router.post('/batch-get', getToolsByIds);

// ==========================================
// [SHARED] Tool QR Validity & Inspection Endpoints
// Consumed by both Web (tool.service.ts) and Mobile (toolService.ts)
// ==========================================

/**
 * [SHARED] GET /api/tools/lookup-validity - Fast tool QR code scan & validity status lookup
 */
router.get('/lookup-validity', lookupToolValidity);

/**
 * [SHARED] POST /api/tools/inspect - Submit third-party statutory inspection update
 */
router.post('/inspect', requireInspectionPermission, inspectTools);

// ==========================================
// [SHARED] Tool Trash, Scrap, Print & Lifecycle Endpoints
// ==========================================

/**
 * [SHARED] GET /api/tools/trash - List soft-deleted tools in trash
 */
router.get('/trash', requireAdmin, getDeletedTools);

/**
 * [SHARED] GET /api/tools/scrap - List scrapped tools register
 */
router.get('/scrap', getScrappedTools);

/**
 * [SHARED] POST /api/tools/bulk-scrap - Mark multiple tools as scrapped
 */
router.post('/bulk-scrap', restrictInspectionUser('scrapping tools directly'), bulkScrapTools);

/**
 * [SHARED] POST /api/tools/scrap - Alias for bulk scrap
 */
router.post('/scrap', restrictInspectionUser('scrapping tools directly'), bulkScrapTools);

/**
 * [SHARED] POST /api/tools/mark-printed - Mark tools as QR label printed
 */
router.post('/mark-printed', restrictInspectionUser('marking tools as printed'), markToolsAsPrinted);

/**
 * [SHARED] POST /api/tools/unmark-printed - Unmark tools printed status (revert to unprinted)
 */
router.post('/unmark-printed', restrictInspectionUser('unmarking tools as printed'), unmarkToolsAsPrinted);

/**
 * [SHARED] POST /api/tools/bulk-delete - Move multiple tools to trash
 */
router.post('/bulk-delete', requireAdmin, bulkDeleteTools);

/**
 * [SHARED] POST /api/tools/bulk-restore - Restore multiple tools from trash
 */
router.post('/bulk-restore', requireAdmin, bulkRestoreTools);

/**
 * [SHARED] POST /api/tools/bulk-permanent-delete - Permanently purge multiple tools from database
 */
router.post('/bulk-permanent-delete', requireAdmin, bulkPermanentDeleteTools);

/**
 * [SHARED] POST /api/tools/bulk-edit - Apply bulk updates to common tool attributes
 */
router.post('/bulk-edit', requireAdmin, bulkEditTools);

/**
 * [SHARED] POST /api/tools/transfer - Transfer tools between stores
 */
router.post('/transfer', restrictInspectionUser('transferring tools'), transferTools);

/**
 * [WEB] GET /api/tools/delete-jobs/:jobId/stream - Real-time SSE progress stream for delete job
 */
router.get('/delete-jobs/:jobId/stream', requireAdmin, streamDeleteJobProgress);

/**
 * [WEB] GET /api/tools/delete-jobs/:jobId/status - Poll status of delete job
 */
router.get('/delete-jobs/:jobId/status', requireAdmin, getDeleteJobStatus);

// ==========================================
// [SHARED] Single Tool Parameter Endpoints (:toolId)
// ==========================================

/**
 * [SHARED] POST /api/tools/:toolId/restore - Restore single tool from trash
 */
router.post('/:toolId/restore', requireAdmin, restoreToolById);

/**
 * [SHARED] DELETE /api/tools/:toolId/permanent - Permanently purge single tool
 */
router.delete('/:toolId/permanent', requireAdmin, permanentDeleteToolById);

/**
 * [SHARED] GET /api/tools/:toolId - Get full tool record by ID
 */
router.get('/:toolId', getToolById);

/**
 * [SHARED] PUT /api/tools/:toolId - Update tool details (Admin only)
 */
router.put('/:toolId', requireAdmin, updateToolById);

/**
 * [SHARED] DELETE /api/tools/:toolId - Soft delete single tool to trash (Admin only)
 */
router.delete('/:toolId', requireAdmin, deleteToolById);

export default router;
