import { Store } from '../models/store.model.js';

const createStore = async (storeData) => {
    const data = { ...storeData };
    if (data.storeName) data.name = data.storeName;
    if (data.projectId && !data.project) {
        data.project = data.projectId;
    }
    const store = new Store(data);
    await store.save();
    return store;
};

const getStores = async (projectId) => {
    const query = {};
    if (projectId) {
        query.project = projectId;
    }
    const stores = await Store.find(query).populate('project', 'name').sort({ createdAt: -1 });
    
    return stores.map(store => {
        const obj = store.toObject();
        if (obj.project && typeof obj.project === 'object') {
            obj.projectId = obj.project._id;
            obj.projectName = obj.project.name;
        }
        return obj;
    });
};

const getStoreById = async (id) => {
    return await Store.findById(id).populate('project', 'name');
};

const updateStore = async (id, updateData) => {
    return await Store.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
};

const deleteStore = async (id) => {
    return await Store.findByIdAndDelete(id);
};

export const storeService = {
    createStore,
    getStores,
    getStoreById,
    updateStore,
    deleteStore
};
