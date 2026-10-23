import express from 'express';
import multer from 'multer';
import {
    createStore,
    getStores,
    getStoreById,
    updateStore,
    deleteStore
} from '../controllers/store.controller.js';
import {
    getToolsByStoreId,
    getToolById,
    createToolInStore,
    exportToolsByStoreId,
    getToolFilterOptions,
    bulkEditTools,
    bulkDeleteTools,
    transferTools
} from '../controllers/tool.controller.js';
import { importController } from '../controllers/import.controller.js';
import { authenticate, requirePagePermission, requireAdmin, restrictInspectionUser } from '../middleware/auth.middleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, requirePagePermission("/stores"));

// ==========================================
// [SHARED] Store CRUD Endpoints
// Consumed by both Web (store.service.ts) and Mobile (storeService.ts)
// ==========================================

/**
 * [SHARED] POST /api/stores - Create new store (Admin only)
 */
router.post('/', requireAdmin, createStore);

/**
 * [SHARED] GET /api/stores - List all stores with site & location details
 */
router.get('/', getStores);

/**
 * [SHARED] GET /api/stores/:id - Get store details by ID
 */
router.get('/:id', getStoreById);

/**
 * [SHARED] PUT /api/stores/:id - Update existing store (Admin only)
 */
router.put('/:id', requireAdmin, updateStore);

/**
 * [SHARED] DELETE /api/stores/:id - Delete store by ID (Admin only)
 */
router.delete('/:id', requireAdmin, deleteStore);

// ==========================================
// [SHARED] & [WEB] Store-Scoped Tool Endpoints (/api/stores/:storeId/tools)
// ==========================================

/**
 * [WEB] GET /api/stores/:storeId/tools/export - Export store tools to Excel
 * Exclusively consumed by Web application store view.
 */
router.get('/:storeId/tools/export', exportToolsByStoreId);

/**
 * [SHARED] GET /api/stores/:storeId/tools/filter-options - Category/Condition filter options
 */
router.get('/:storeId/tools/filter-options', getToolFilterOptions);

/**
 * [SHARED] GET /api/stores/:storeId/tools/:toolId - Get tool details within store
 */
router.get('/:storeId/tools/:toolId', getToolById);

/**
 * [SHARED] GET /api/stores/:storeId/tools - List store tools with filters, pagination, and status ribbon counts
 */
router.get('/:storeId/tools', getToolsByStoreId);

/**
 * [SHARED] POST /api/stores/:storeId/tools - Add a new tool to store inventory
 */
router.post('/:storeId/tools', createToolInStore);

/**
 * [SHARED] POST /api/stores/:storeId/tools/bulk-edit - Bulk edit multiple tool properties
 */
router.post('/:storeId/tools/bulk-edit', requireAdmin, bulkEditTools);

/**
 * [SHARED] POST /api/stores/:storeId/tools/bulk-delete - Bulk move tools to trash
 */
router.post('/:storeId/tools/bulk-delete', requireAdmin, bulkDeleteTools);

/**
 * [SHARED] POST /api/stores/:storeId/tools/transfer - Transfer tools to another store
 */
router.post('/:storeId/tools/transfer', restrictInspectionUser('transferring tools'), transferTools);

// ==========================================
// [SHARED] Bulk Import Core Endpoints
// Consumed by both Web and Mobile BulkImportModal
// ==========================================

/**
 * [SHARED] GET /api/stores/:storeId/tools/bulk-import/sample - Download sample Excel template
 */
router.get('/:storeId/tools/bulk-import/sample', importController.downloadStoreToolsSample);

/**
 * [SHARED] GET /api/stores/tools/bulk-import/sample - Fallback sample template route
 */
router.get('/tools/bulk-import/sample', importController.downloadStoreToolsSample);

/**
 * [SHARED] POST /api/stores/:storeId/tools/bulk-import/preview - Validate and preview uploaded spreadsheet
 */
router.post('/:storeId/tools/bulk-import/preview', upload.single('file'), importController.previewStoreToolsImport);

/**
 * [SHARED] POST /api/stores/:storeId/tools/bulk-import/commit - Commit validated import job
 */
router.post('/:storeId/tools/bulk-import/commit', importController.commitStoreToolsImport);

// ==========================================
// [WEB] Import Job Management & SSE Progress Streams
// Exclusively consumed by Web application import wizard (client/src/services/store.service.ts)
// ==========================================

/**
 * [WEB] GET /api/stores/:storeId/tools/bulk-import/jobs/:jobId - Query import job status
 */
router.get('/:storeId/tools/bulk-import/jobs/:jobId', importController.getImportedJobTools);

/**
 * [WEB] GET /api/stores/:storeId/tools/bulk-import/jobs/:jobId/records - Paginated job preview records
 */
router.get('/:storeId/tools/bulk-import/jobs/:jobId/records', importController.getImportJobRecords);

/**
 * [WEB] GET /api/stores/:storeId/tools/bulk-import/jobs/:jobId/progress - SSE stream for real-time progress
 */
router.get('/:storeId/tools/bulk-import/jobs/:jobId/progress', importController.streamImportJobProgress);

/**
 * [WEB] GET /api/stores/:storeId/tools/bulk-import/jobs/:jobId/imported-tools - Retrieve all imported tools
 */
router.get('/:storeId/tools/bulk-import/jobs/:jobId/imported-tools', importController.getImportedJobTools);

export default router;
