import { Store } from '../models/store.model.js';
import { Tool } from '../models/tool.model.js';

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

const getStores = async (projectId, assignedStoreIds = null) => {
    const query = {};
    if (projectId) {
        query.project = projectId;
    }
    if (assignedStoreIds && Array.isArray(assignedStoreIds)) {
        query._id = { $in: assignedStoreIds };
    }
    const stores = await Store.find(query).populate('project', 'name').sort({ createdAt: -1 });
    
    const storeObjects = await Promise.all(
        stores.map(async (store) => {
            const obj = store.toObject();
            if (obj.project && typeof obj.project === 'object') {
                obj.projectId = obj.project._id;
                obj.projectName = obj.project.name;
            }
            const count = await Tool.countDocuments({
                $or: [
                    { currentSite: store._id },
                    { store: store._id }
                ]
            });
            obj.toolsCount = count;
            return obj;
        })
    );
    return storeObjects;
};

const getStoreById = async (id) => {
    const store = await Store.findById(id).populate('project', 'name');
    if (!store) return null;
    const obj = store.toObject();
    if (obj.project && typeof obj.project === 'object') {
        obj.projectId = obj.project._id;
        obj.projectName = obj.project.name;
    }
    const count = await Tool.countDocuments({
        $or: [
            { currentSite: store._id },
            { store: store._id }
        ]
    });
    obj.toolsCount = count;
    return obj;
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
