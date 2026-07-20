import express from 'express';
import {
    createStore,
    getStores,
    getStoreById,
    updateStore,
    deleteStore
} from '../controllers/store.controller.js';

const router = express.Router();

router.post('/', createStore);
router.get('/', getStores);
router.get('/:id', getStoreById);
router.put('/:id', updateStore);
router.delete('/:id', deleteStore);

export default router;
