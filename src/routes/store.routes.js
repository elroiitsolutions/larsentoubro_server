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
    createToolInStore,
    exportToolsByStoreId,
    getToolFilterOptions,
    bulkEditTools
} from '../controllers/tool.controller.js';
import { importController } from '../controllers/import.controller.js';
import { authenticate, requirePagePermission } from '../middleware/auth.middleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, requirePagePermission("/stores"));

// Store CRUD Endpoints
router.post('/', createStore);
router.get('/', getStores);
router.get('/:id', getStoreById);
router.put('/:id', updateStore);
router.delete('/:id', deleteStore);

// Store-Scoped Tool Endpoints (/api/stores/:storeId/tools)
router.get('/:storeId/tools/export', exportToolsByStoreId);
router.get('/:storeId/tools/filter-options', getToolFilterOptions);
router.get('/:storeId/tools', getToolsByStoreId);
router.post('/:storeId/tools', createToolInStore);
router.post('/:storeId/tools/bulk-edit', bulkEditTools);

// Store-Scoped Tool Bulk Import Endpoints
router.get('/:storeId/tools/bulk-import/sample', importController.downloadStoreToolsSample);
router.get('/tools/bulk-import/sample', importController.downloadStoreToolsSample);
router.post('/:storeId/tools/bulk-import/preview', upload.single('file'), importController.previewStoreToolsImport);
router.post('/:storeId/tools/bulk-import/commit', importController.commitStoreToolsImport);

export default router;
