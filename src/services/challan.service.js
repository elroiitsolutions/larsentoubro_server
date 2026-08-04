import mongoose from 'mongoose';
import { Challan } from '../models/challan.model.js';
import { Counter } from '../models/counter.model.js';
import { Tool } from '../models/tool.model.js';
import { ToolMovement } from '../models/toolMovement.model.js';
import { MissingTool } from '../models/missingTool.model.js';
import { ChallanAuditLog } from '../models/challanAuditLog.model.js';
import { Vendor } from '../models/vendor.model.js';
import * as vendorService from './vendor.service.js';

/**
 * Helper to generate sequential Challan numbers like DC-2026-000001 or RC-2026-000001
 */
export const generateChallanNumber = async (type, session = null) => {
    const year = new Date().getFullYear();
    const counterId = `challan_${type.toLowerCase()}_${year}`;
    const prefix = type === 'Delivery' ? 'DC' : 'RC';

    const options = { new: true, upsert: true };
    if (session) options.session = session;

    const counter = await Counter.findByIdAndUpdate(
        counterId,
        { $inc: { seq: 1 } },
        options
    );

    const serialNum = String(counter.seq).padStart(6, '0');
    return `${prefix}-${year}-${serialNum}`;
};

/**
 * Execute transaction safely whether replica set is enabled or standalone
 */
const runInTransaction = async (callback) => {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await callback(session);
        });
        return result;
    } catch (err) {
        // Fallback for standalone MongoDB instances that do not support transactions
        if (err.message && (err.message.includes('Transaction numbers') || err.message.includes('standalone'))) {
            return await callback(null);
        }
        throw err;
    } finally {
        await session.endSession();
    }
};

/**
 * Create Delivery Challan (DC)
 */
export const createDeliveryChallan = async (data, user = {}) => {
    const {
        vendorId,
        storeId,
        challanDate,
        deliveryDate,
        remarks = '',
        notes = '',
        items = []
    } = data;

    if (!items || items.length === 0) {
        throw new Error('At least one tool item is required to create a Delivery Challan');
    }

    const vendorDoc = await vendorService.getVendorById(vendorId);
    if (!vendorDoc) {
        throw new Error('Selected vendor not found');
    }

    return await runInTransaction(async (session) => {
        const challanNumber = await generateChallanNumber('Delivery', session);

        // Snapshot vendor info
        const vendorSnapshot = {
            _id: vendorDoc._id,
            name: vendorDoc.name,
            vendorCode: vendorDoc.vendorCode,
            address: vendorDoc.address,
            gstNumber: vendorDoc.gstNumber,
            contactPerson: vendorDoc.contactPerson,
            contactPhone: vendorDoc.contactPhone
        };

        const createdBy = {
            _id: user._id || null,
            name: user.name || user.username || 'System User',
            email: user.email || 'system@landt.com'
        };

        const challan = new Challan({
            challanNumber,
            challanType: 'Delivery',
            status: 'Active',
            vendor: vendorSnapshot,
            store: storeId || null,
            challanDate: challanDate ? new Date(challanDate) : new Date(),
            deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
            remarks,
            notes,
            items: items.map(it => ({
                ...it,
                returnStatus: 'Sent'
            })),
            toolCount: items.length,
            createdBy
        });

        const saveOptions = session ? { session } : {};
        await challan.save(saveOptions);

        // Update Tool Status to 'Moving' and log movements
        const toolIds = items.map(i => i.tool);
        const updateOptions = session ? { session } : {};
        await Tool.updateMany(
            { _id: { $in: toolIds } },
            { $set: { status: 'Moving' } },
            updateOptions
        );

        const movementLogs = items.map(item => ({
            tool: item.tool,
            toolIdStr: item.toolId,
            description: item.description || '',
            movementType: 'Delivery',
            from: 'Store',
            to: vendorSnapshot.name,
            referenceNumber: challanNumber,
            date: new Date(),
            user: createdBy.name,
            remarks: remarks || `Dispatched via ${challanNumber}`
        }));

        const insertOptions = session ? { session } : {};
        await ToolMovement.insertMany(movementLogs, insertOptions);

        // Audit log
        const auditLog = new ChallanAuditLog({
            user: createdBy,
            action: 'DC Creation',
            referenceNumber: challanNumber,
            details: `Created Delivery Challan ${challanNumber} with ${items.length} tools for vendor ${vendorSnapshot.name}`,
            metadata: { toolCount: items.length, vendorName: vendorSnapshot.name }
        });
        await auditLog.save(saveOptions);

        // Update vendor metrics
        await vendorService.updateVendorMetrics(vendorId, { dcDelta: 1 }, session);

        return challan;
    });
};

/**
 * Create Return Challan (RC) for a Delivery Challan
 */
export const createReturnChallan = async (data, user = {}) => {
    const {
        referenceDcId,
        challanDate,
        remarks = '',
        notes = '',
        items = [] // Array of { tool, toolId, description, toolCode, quantity, unit, rate, returnStatus: 'Returned' | 'Missing', remarks }
    } = data;

    if (!referenceDcId) {
        throw new Error('Reference Delivery Challan ID is required');
    }

    const referenceDc = await Challan.findById(referenceDcId);
    if (!referenceDc) {
        throw new Error('Reference Delivery Challan not found');
    }

    if (referenceDc.status !== 'Active') {
        throw new Error(`Return Challan cannot be created because DC status is '${referenceDc.status}' (Must be Active)`);
    }

    return await runInTransaction(async (session) => {
        const challanNumber = await generateChallanNumber('Return', session);

        const createdBy = {
            _id: user._id || null,
            name: user.name || user.username || 'System User',
            email: user.email || 'system@landt.com'
        };

        const returnedItems = items.filter(i => i.returnStatus === 'Returned');
        const missingItems = items.filter(i => i.returnStatus === 'Missing');

        const challan = new Challan({
            challanNumber,
            challanType: 'Return',
            status: 'Completed',
            vendor: referenceDc.vendor,
            store: referenceDc.store,
            challanDate: challanDate ? new Date(challanDate) : new Date(),
            remarks,
            notes,
            referenceDcId: referenceDc._id,
            referenceDcNumber: referenceDc.challanNumber,
            items,
            toolCount: items.length,
            returnedCount: returnedItems.length,
            missingCount: missingItems.length,
            createdBy
        });

        const saveOptions = session ? { session } : {};
        await challan.save(saveOptions);

        // Mark reference DC as Completed to prevent duplicate RC creation
        referenceDc.status = 'Completed';
        referenceDc.returnedCount = returnedItems.length;
        referenceDc.missingCount = missingItems.length;
        await referenceDc.save(saveOptions);

        // Process Returned Tools -> status: 'Available'
        if (returnedItems.length > 0) {
            const returnedToolIds = returnedItems.map(i => i.tool);
            await Tool.updateMany(
                { _id: { $in: returnedToolIds } },
                { $set: { status: 'Available' } },
                session ? { session } : {}
            );

            const returnLogs = returnedItems.map(item => ({
                tool: item.tool,
                toolIdStr: item.toolId,
                description: item.description || '',
                movementType: 'Return',
                from: referenceDc.vendor.name,
                to: 'Store',
                referenceNumber: challanNumber,
                date: new Date(),
                user: createdBy.name,
                remarks: item.remarks || `Returned via ${challanNumber}`
            }));
            await ToolMovement.insertMany(returnLogs, session ? { session } : {});
        }

        // Process Missing Tools -> status: 'Missing' & save in MissingTool
        if (missingItems.length > 0) {
            const missingToolIds = missingItems.map(i => i.tool);
            await Tool.updateMany(
                { _id: { $in: missingToolIds } },
                { $set: { status: 'Missing' } },
                session ? { session } : {}
            );

            const missingLogs = missingItems.map(item => ({
                tool: item.tool,
                toolIdStr: item.toolId,
                description: item.description || '',
                movementType: 'Missing',
                from: referenceDc.vendor.name,
                to: 'Missing',
                referenceNumber: challanNumber,
                date: new Date(),
                user: createdBy.name,
                remarks: item.remarks || `Flagged as missing on return ${challanNumber}`
            }));
            await ToolMovement.insertMany(missingLogs, session ? { session } : {});

            const missingRecords = missingItems.map(item => ({
                tool: item.tool,
                toolIdStr: item.toolId,
                description: item.description || '',
                toolCode: item.toolCode || '',
                vendor: referenceDc.vendor._id,
                vendorName: referenceDc.vendor.name,
                dcNumber: referenceDc.challanNumber,
                rcNumber: challanNumber,
                missingDate: new Date(),
                reportedBy: createdBy.name,
                remarks: item.remarks || 'Tool not returned against Delivery Challan',
                status: 'Missing'
            }));
            await MissingTool.insertMany(missingRecords, session ? { session } : {});
        }

        // Audit log
        const auditLog = new ChallanAuditLog({
            user: createdBy,
            action: 'RC Creation',
            referenceNumber: challanNumber,
            details: `Created Return Challan ${challanNumber} for DC ${referenceDc.challanNumber} (${returnedItems.length} returned, ${missingItems.length} missing)`,
            metadata: { returnedCount: returnedItems.length, missingCount: missingItems.length, dcNumber: referenceDc.challanNumber }
        });
        await auditLog.save(saveOptions);

        // Update vendor metrics
        await vendorService.updateVendorMetrics(referenceDc.vendor._id, {
            rcDelta: 1,
            returnedDelta: returnedItems.length,
            missingDelta: missingItems.length
        }, session);

        return challan;
    });
};

/**
 * Get paginated & filtered Challans
 */
export const getChallans = async (params = {}) => {
    const {
        page = 1,
        limit = 20,
        search = '',
        vendor = 'All',
        status = 'All',
        challanType = 'All',
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = params;

    const query = {};

    if (search) {
        query.$or = [
            { challanNumber: { $regex: search, $options: 'i' } },
            { 'vendor.name': { $regex: search, $options: 'i' } },
            { 'vendor.vendorCode': { $regex: search, $options: 'i' } },
            { remarks: { $regex: search, $options: 'i' } },
            { referenceDcNumber: { $regex: search, $options: 'i' } }
        ];
    }

    if (vendor && vendor !== 'All') {
        query['vendor._id'] = vendor;
    }

    if (status && status !== 'All') {
        query.status = status;
    }

    if (challanType && challanType !== 'All') {
        query.challanType = challanType;
    }

    if (startDate || endDate) {
        query.challanDate = {};
        if (startDate) query.challanDate.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.challanDate.$lte = end;
        }
    }

    const sort = {};
    if (sortBy) {
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
        Challan.find(query)
            .sort(sort)
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        Challan.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
    };
};

/**
 * Get single Challan by ID
 */
export const getChallanById = async (id) => {
    const challan = await Challan.findById(id).lean();
    if (!challan) {
        throw new Error('Challan not found');
    }
    return challan;
};

/**
 * Update Delivery Challan fields
 */
export const updateDeliveryChallan = async (id, data, user = {}) => {
    const challan = await Challan.findById(id);
    if (!challan) {
        throw new Error('Challan not found');
    }
    if (challan.challanType !== 'Delivery' || challan.status !== 'Active') {
        throw new Error('Only active Delivery Challans can be edited');
    }

    if (data.challanDate) challan.challanDate = new Date(data.challanDate);
    if (data.deliveryDate) challan.deliveryDate = new Date(data.deliveryDate);
    if (data.remarks !== undefined) challan.remarks = data.remarks;
    if (data.notes !== undefined) challan.notes = data.notes;
    if (data.vendor) {
        challan.vendor = {
            ...challan.vendor,
            ...data.vendor
        };
    }

    const updated = await challan.save();

    // Audit log
    const createdBy = {
        _id: user._id || null,
        name: user.name || user.username || 'System User',
        email: user.email || 'system@landt.com'
    };
    await ChallanAuditLog.create({
        user: createdBy,
        action: 'DC Edit',
        referenceNumber: challan.challanNumber,
        details: `Edited Delivery Challan ${challan.challanNumber}`
    });

    return updated;
};

/**
 * Log PDF download action
 */
export const logPdfDownload = async (referenceNumber, user = {}, details = 'Downloaded Challan PDF') => {
    const createdBy = {
        _id: user._id || null,
        name: user.name || user.username || 'System User',
        email: user.email || 'system@landt.com'
    };
    return await ChallanAuditLog.create({
        user: createdBy,
        action: 'PDF Download',
        referenceNumber,
        details
    });
};
