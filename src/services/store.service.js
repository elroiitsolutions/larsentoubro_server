import { Store } from '../models/store.model.js';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';
import { FormDefinition } from '../models/formDefinition.model.js';

/**
 * [SHARED] Store Service
 * Business logic and database operations for Store catalog and site inventory.
 * Consumed by both Web Application (store.service.ts) and Mobile App (storeService.ts).
 */

const validateStoreDynamicFields = async (data) => {
    const formDef = await FormDefinition.findOne({ slug: 'create-store', isActive: true });
    if (!formDef || !Array.isArray(formDef.fields)) return;

    for (const field of formDef.fields) {
        const isReq = Boolean(
            field.required ||
            (Array.isArray(field.validations) && field.validations.some(v => v.type === 'required'))
        );
        if (!isReq) continue;

        const fieldKey = field.name || field.id;
        let val = data[fieldKey] !== undefined ? data[fieldKey] : data[field.name];

        if (fieldKey === 'storeName' || field.name === 'storeName' || fieldKey === 'name') {
            val = data.storeName || data.name;
        } else if (fieldKey === 'manager' || fieldKey === 'managerName') {
            val = data.manager || data.managerName;
        } else if (fieldKey === 'location' || field.name === 'location') {
            val = data.location;
        }

        const isEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '') || (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
            const reqRule = Array.isArray(field.validations) ? field.validations.find(v => v.type === 'required') : null;
            const message = (reqRule && reqRule.message) || `${field.label || field.name} is required`;
            const error = new Error(message);
            error.statusCode = 400;
            throw error;
        }
    }
};

const createStore = async (storeData) => {
    const data = { ...storeData };
    if (data.storeName && !data.name) data.name = data.storeName;
    if (data.name && !data.storeName) data.storeName = data.name;
    if (data.managerName && !data.manager) data.manager = data.managerName;
    if (data.manager && !data.managerName) data.managerName = data.manager;

    await validateStoreDynamicFields(data);

    if (data.projectId && !data.project) {
        data.project = data.projectId;
    }
    if (!data.project) {
        const firstProject = await Project.findOne();
        if (firstProject) {
            data.project = firstProject._id;
        }
    }
    const store = new Store(data);
    await store.save();
    return store;
};

const getStores = async (projectId, assignedStoreIds = null, assignedToolIds = null) => {
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
            if (obj.name && !obj.storeName) obj.storeName = obj.name;
            if (obj.storeName && !obj.name) obj.name = obj.storeName;
            if (obj.manager && !obj.managerName) obj.managerName = obj.manager;
            if (obj.managerName && !obj.manager) obj.manager = obj.managerName;
            const toolQuery = {
                $or: [
                    { currentSite: store._id },
                    { store: store._id }
                ],
                isDeleted: { $ne: true },
                isScrapped: { $ne: true }
            };
            if (assignedToolIds && Array.isArray(assignedToolIds)) {
                toolQuery._id = { $in: assignedToolIds };
            }
            const count = await Tool.countDocuments(toolQuery);
            obj.toolsCount = count;
            obj.totalToolsCount = count;
            obj.availableToolsCount = count;
            return obj;
        })
    );
    return storeObjects;
};

const getStoreById = async (id, assignedToolIds = null) => {
    const store = await Store.findById(id).populate('project', 'name');
    if (!store) return null;
    const obj = store.toObject();
    if (obj.project && typeof obj.project === 'object') {
        obj.projectId = obj.project._id;
        obj.projectName = obj.project.name;
    }
    if (obj.name && !obj.storeName) obj.storeName = obj.name;
    if (obj.storeName && !obj.name) obj.name = obj.storeName;
    if (obj.manager && !obj.managerName) obj.managerName = obj.manager;
    if (obj.managerName && !obj.manager) obj.manager = obj.managerName;
    const toolQuery = {
        $or: [
            { currentSite: store._id },
            { store: store._id }
        ],
        isDeleted: { $ne: true },
        isScrapped: { $ne: true }
    };
    if (assignedToolIds && Array.isArray(assignedToolIds)) {
        toolQuery._id = { $in: assignedToolIds };
    }
    const count = await Tool.countDocuments(toolQuery);
    obj.toolsCount = count;
    obj.totalToolsCount = count;
    obj.availableToolsCount = count;
    return obj;
};

const updateStore = async (id, updateData) => {
    const data = { ...updateData };
    if (data.storeName && !data.name) data.name = data.storeName;
    if (data.name && !data.storeName) data.storeName = data.name;
    if (data.managerName && !data.manager) data.manager = data.managerName;
    if (data.manager && !data.managerName) data.managerName = data.manager;
    return await Store.findByIdAndUpdate(id, data, { new: true, runValidators: true });
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
