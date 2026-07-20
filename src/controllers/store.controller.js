import { storeService } from '../services/store.service.js';

export const createStore = async (req, res, next) => {
    try {
        const store = await storeService.createStore(req.body);
        res.status(201).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
};

export const getStores = async (req, res, next) => {
    try {
        const stores = await storeService.getStores(req.query.projectId);
        res.status(200).json({ success: true, data: stores });
    } catch (error) {
        next(error);
    }
};

export const getStoreById = async (req, res, next) => {
    try {
        const store = await storeService.getStoreById(req.params.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
};

export const updateStore = async (req, res, next) => {
    try {
        const store = await storeService.updateStore(req.params.id, req.body);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
};

export const deleteStore = async (req, res, next) => {
    try {
        const store = await storeService.deleteStore(req.params.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
