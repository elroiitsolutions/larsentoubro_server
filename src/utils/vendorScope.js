import { Challan } from '../models/challan.model.js';
import { Store } from '../models/store.model.js';
import { Vendor } from '../models/vendor.model.js';
import mongoose from 'mongoose';

/**
 * Returns the exact assigned scope for a logged-in Vendor based on active Delivery Challans (DCs).
 * Workflow: Vendor -> Active Delivery Challans (DC) -> Assigned Tools (returnStatus: 'Sent') -> Stores -> Projects
 * 
 * @param {Object} user - The req.user object attached by auth middleware
 * @returns {Promise<{
 *   isVendor: boolean,
 *   assignedToolIds: string[],
 *   assignedToolObjectIds: mongoose.Types.ObjectId[],
 *   assignedStoreIds: string[],
 *   assignedStoreObjectIds: mongoose.Types.ObjectId[],
 *   assignedProjectIds: string[],
 *   assignedProjectObjectIds: mongoose.Types.ObjectId[]
 * }>}
 */
export const getVendorAssignedScope = async (user) => {
    if (!user || user.role !== 'Vendor') {
        return {
            isVendor: false,
            assignedToolIds: [],
            assignedToolObjectIds: [],
            assignedStoreIds: [],
            assignedStoreObjectIds: [],
            assignedProjectIds: [],
            assignedProjectObjectIds: []
        };
    }

    const userIdStr = user._id ? user._id.toString() : user.id ? user.id.toString() : '';
    let vendorRecord = null;

    if (userIdStr && mongoose.Types.ObjectId.isValid(userIdStr)) {
        vendorRecord = await Vendor.findById(userIdStr).lean();
    }
    if (!vendorRecord && user.email) {
        vendorRecord = await Vendor.findOne({
            $or: [
                { contactEmail: user.email.toLowerCase() },
                { email: user.email.toLowerCase() }
            ]
        }).lean();
    }

    const vendorId = vendorRecord ? vendorRecord._id : (user._id || user.id);
    const vendorCode = vendorRecord ? vendorRecord.vendorCode : (user.vendorCode || user.user_id);
    const vendorEmail = vendorRecord ? vendorRecord.contactEmail : user.email;

    // Match criteria for Delivery Challans assigned to this vendor
    const vendorMatch = [];
    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId.toString())) {
        vendorMatch.push({ 'vendor._id': new mongoose.Types.ObjectId(vendorId.toString()) });
        vendorMatch.push({ 'vendor._id': vendorId.toString() });
    }
    if (vendorCode) {
        vendorMatch.push({ 'vendor.vendorCode': { $regex: `^${vendorCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
        vendorMatch.push({ vendorCode: { $regex: `^${vendorCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    }
    if (vendorEmail) {
        vendorMatch.push({ 'vendor.contactEmail': { $regex: `^${vendorEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    }

    const dcQuery = {
        challanType: 'Delivery',
        status: { $ne: 'Cancelled' },
        $or: vendorMatch
    };

    const deliveryChallans = await Challan.find(dcQuery).lean();

    const toolObjIdSet = new Set();
    const toolIdStrSet = new Set();
    const storeObjIdSet = new Set();
    const storeIdStrSet = new Set();

    for (const dc of deliveryChallans) {
        if (dc.store) {
            const storeIdStr = dc.store.toString();
            storeIdStrSet.add(storeIdStr);
            if (mongoose.Types.ObjectId.isValid(storeIdStr)) {
                storeObjIdSet.add(storeIdStr);
            }
        }

        if (Array.isArray(dc.items)) {
            for (const item of dc.items) {
                // Included if status is 'Sent' or not returned/missing
                if (item && item.returnStatus !== 'Returned' && item.returnStatus !== 'Missing') {
                    if (item.tool) {
                        const tIdStr = item.tool.toString();
                        toolIdStrSet.add(tIdStr);
                        if (mongoose.Types.ObjectId.isValid(tIdStr)) {
                            toolObjIdSet.add(tIdStr);
                        }
                    }
                }
            }
        }
    }

    const assignedStoreObjectIds = Array.from(storeObjIdSet).map(id => new mongoose.Types.ObjectId(id));
    const assignedStoreIds = Array.from(storeIdStrSet);

    // Resolve associated Projects from assigned Stores
    const stores = await Store.find({ _id: { $in: assignedStoreObjectIds } }).lean();

    const projObjIdSet = new Set();
    const projIdStrSet = new Set();

    for (const s of stores) {
        if (s.project) {
            const pIdStr = s.project.toString();
            projIdStrSet.add(pIdStr);
            if (mongoose.Types.ObjectId.isValid(pIdStr)) {
                projObjIdSet.add(pIdStr);
            }
        }
    }

    const assignedToolObjectIds = Array.from(toolObjIdSet).map(id => new mongoose.Types.ObjectId(id));
    const assignedToolIds = Array.from(toolIdStrSet);
    const assignedProjectObjectIds = Array.from(projObjIdSet).map(id => new mongoose.Types.ObjectId(id));
    const assignedProjectIds = Array.from(projIdStrSet);

    return {
        isVendor: true,
        assignedToolIds,
        assignedToolObjectIds,
        assignedStoreIds,
        assignedStoreObjectIds,
        assignedProjectIds,
        assignedProjectObjectIds
    };
};
