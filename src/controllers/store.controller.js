import { storeService } from '../services/store.service.js';

export const createStore = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Only Admins can create stores.' });
        }
        const store = await storeService.createStore(req.body);
        res.status(201).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
};

export const getStores = async (req, res, next) => {
    try {
        let assignedStoreIds = null;
        if (req.user && req.user.role !== 'Admin') {
            const assignedProjectIds = (req.user.projects || []).map(p => (p._id || p).toString());
            if (req.query.projectId && !assignedProjectIds.includes(req.query.projectId.toString())) {
                return res.status(403).json({ success: false, message: 'Access denied to this project.' });
            }
            assignedStoreIds = (req.user.stores || []).map(s => (s._id || s).toString());
        }
        const stores = await storeService.getStores(req.query.projectId, assignedStoreIds);
        res.status(200).json({ success: true, data: stores });
    } catch (error) {
        next(error);
    }
};

export const getStoreById = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin') {
            const assignedStoreIds = (req.user.stores || []).map(s => (s._id || s).toString());
            if (!assignedStoreIds.includes(req.params.id.toString())) {
                return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this store.' });
            }
        }
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
        if (req.user && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Only Admins can modify stores.' });
        }
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
        if (req.user && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Only Admins can delete stores.' });
        }
        const store = await storeService.deleteStore(req.params.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
