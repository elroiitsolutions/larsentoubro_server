import mongoose from 'mongoose';
import { Challan } from '../models/challan.model.js';
import { Counter } from '../models/counter.model.js';
import { Tool } from '../models/tool.model.js';
import { ToolMovement } from '../models/toolMovement.model.js';
import { MissingTool } from '../models/missingTool.model.js';
import { ChallanAuditLog } from '../models/challanAuditLog.model.js';
import { Vendor } from '../models/vendor.model.js';
import * as vendorService from './vendor.service.js';
import * as profileService from './profile.service.js';

/**
 * Helper to generate sequential Challan numbers like DC-26-001 or RC-26-001
 * - Counter resets per year (using year in counterId)
 * - DC and RC have separate counters
 * - Atomic $inc operation ensures concurrency safety
 * - Minimum 3-digit padding (001, 002... 999, 1000...)
 */
export const generateChallanNumber = async (type, session = null) => {
    const fullYear = new Date().getFullYear();
    const shortYear = String(fullYear).slice(-2);
    const counterId = `challan_${type.toLowerCase()}_${fullYear}`;
    const prefix = type === 'Delivery' ? 'DC' : 'RC';

    // Self-healing: Find maximum existing serial number for this type and year in database
    const regex = new RegExp(`^${prefix}-${shortYear}-(\\d+)$`, 'i');
    const queryOptions = session ? { session } : {};
    const existingChallans = await Challan.find(
        { challanType: type, challanNumber: { $regex: regex } },
        { challanNumber: 1 },
        queryOptions
    ).lean();

    let maxSeq = 0;
    for (const c of existingChallans) {
        if (c.challanNumber) {
            const match = c.challanNumber.match(regex);
            if (match && match[1]) {
                const seqNum = parseInt(match[1], 10);
                if (!isNaN(seqNum) && seqNum > maxSeq) {
                    maxSeq = seqNum;
                }
            }
        }
    }

    const options = { new: true, upsert: true };
    if (session) options.session = session;

    // If counter is missing or out of sync (higher than actual maxSeq in DB), reset counter to maxSeq
    const currentCounter = await Counter.findById(counterId, null, queryOptions);
    if (!currentCounter || currentCounter.seq > maxSeq) {
        await Counter.findByIdAndUpdate(
            counterId,
            { seq: maxSeq },
            options
        );
    }

    const counter = await Counter.findByIdAndUpdate(
        counterId,
        { $inc: { seq: 1 } },
        options
    );

    const serialNum = String(counter.seq).padStart(3, '0');
    return `${prefix}-${shortYear}-${serialNum}`;
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
        transferFromDcId,
        vendorId,
        storeId,
        siteCode = '',
        vendorCode = '',
        subcontractorName = '',
        locationChainage = '',
        workFrontLocation = '',
        trnCode = '',
        sendingCentreCode = '',
        mrNo = '',
        mrDate = '',
        stockType = '',
        ewayBillNo = '',
        gatePassNo = '',
        gatePassApprovedBy = '',
        consignorTaxNo = '',
        vehicleNo = '',
        lrNo = '',
        freightStatus = '',
        receiverName = '',
        receiverMobile = '',
        mrnNo = '',
        receiptDate = '',
        challanDate,
        deliveryDate,
        remarks = '',
        notes = '',
        items = []
    } = data;

    if (!items || items.length === 0) {
        throw new Error('At least one tool item is required to create a Delivery Challan');
    }

    const cleanSiteCode = typeof siteCode === 'string' ? siteCode.trim() : '';
    if (!cleanSiteCode) {
        throw new Error('Site Code is required to create a Delivery Challan');
    }

    let sourceDc = null;
    if (transferFromDcId) {
        sourceDc = await Challan.findById(transferFromDcId);
        if (!sourceDc) {
            throw new Error('Source Delivery Challan for transfer not found');
        }
        if (sourceDc.status !== 'Active') {
            throw new Error(`Cannot transfer from Challan ${sourceDc.challanNumber}: status is '${sourceDc.status}' (Must be Active)`);
        }
    }

    const toolIds = items.map(i => i.tool);
    const toolsToCheck = await Tool.find({ _id: { $in: toolIds } });

    // When transferring, tools are already dispatched on source DC so status is expected to be Moving
    if (!sourceDc) {
        const invalidMoving = toolsToCheck.filter(t => t.status === 'Moving');
        if (invalidMoving.length > 0) {
            throw new Error(`Cannot create Delivery Challan: Tool(s) ${invalidMoving.map(t => t.toolId).join(', ')} are already Moving`);
        }
    }

    const invalidMissing = toolsToCheck.filter(t => t.status === 'Missing');
    if (invalidMissing.length > 0) {
        throw new Error(`Cannot create Delivery Challan: Tool(s) ${invalidMissing.map(t => t.toolId).join(', ')} are marked as Missing`);
    }

    const targetVendorId = vendorId || (sourceDc && sourceDc.vendor?._id);
    let vendorDoc = null;
    if (targetVendorId) {
        vendorDoc = await vendorService.getVendorById(targetVendorId);
    }
    if (!vendorDoc && sourceDc && sourceDc.vendor) {
        vendorDoc = sourceDc.vendor;
    }
    if (!vendorDoc) {
        throw new Error('Selected vendor not found');
    }

    return await runInTransaction(async (session) => {
        const challanNumber = await generateChallanNumber('Delivery', session);

        // Snapshot vendor info
        const vendorSnapshot = {
            _id: vendorDoc._id,
            name: subcontractorName || vendorDoc.name,
            vendorCode: vendorCode || vendorDoc.vendorCode,
            address: vendorDoc.address || '',
            gstNumber: vendorDoc.gstNumber || '',
            contactPerson: vendorDoc.contactPerson || '',
            contactPhone: vendorDoc.contactPhone || ''
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
            siteCode: cleanSiteCode,
            vendorCode: vendorCode || vendorDoc.vendorCode,
            subcontractorName: subcontractorName || vendorDoc.name,
            locationChainage,
            workFrontLocation,
            trnCode,
            sendingCentreCode,
            mrNo,
            mrDate,
            stockType,
            ewayBillNo,
            gatePassNo,
            gatePassApprovedBy,
            consignorTaxNo,
            vehicleNo,
            lrNo,
            freightStatus,
            receiverName,
            receiverMobile,
            mrnNo,
            receiptDate,
            vendor: vendorSnapshot,
            store: storeId || (sourceDc && sourceDc.store) || null,
            challanDate: challanDate ? new Date(challanDate) : new Date(),
            deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
            remarks: remarks || (sourceDc ? `Site Transfer from ${sourceDc.challanNumber}` : ''),
            notes,
            referenceDcId: sourceDc ? sourceDc._id : null,
            referenceDcNumber: sourceDc ? sourceDc.challanNumber : '',
            transferFromDcId: sourceDc ? sourceDc._id : null,
            transferFromDcNumber: sourceDc ? sourceDc.challanNumber : '',
            items: items.map(it => ({
                ...it,
                returnStatus: 'Sent'
            })),
            toolCount: items.length,
            createdBy
        });

        const saveOptions = session ? { session } : {};
        await challan.save(saveOptions);

        // Update Source DC status to 'Transfer' and reference the new DC
        if (sourceDc) {
            sourceDc.status = 'Transfer';
            sourceDc.transferredToDcId = challan._id;
            sourceDc.transferredToDcNumber = challanNumber;
            await sourceDc.save(saveOptions);
        }

        // Update Tool Status to 'Moving' and log movements
        await Tool.updateMany(
            { _id: { $in: toolIds } },
            { $set: { status: 'Moving' } },
            saveOptions
        );

        const movementLogs = items.map(item => ({
            tool: item.tool,
            toolIdStr: item.toolId,
            description: item.description || '',
            movementType: sourceDc ? 'Transfer' : 'Delivery',
            from: sourceDc ? (sourceDc.siteCode ? `Site: ${sourceDc.siteCode}` : (sourceDc.vendor?.name || 'Previous Site')) : 'Store',
            to: siteCode ? `Site: ${siteCode} (${vendorSnapshot.name})` : vendorSnapshot.name,
            referenceNumber: challanNumber,
            date: new Date(),
            user: createdBy.name,
            remarks: remarks || (sourceDc ? `Transferred from ${sourceDc.challanNumber} to ${challanNumber}` : `Dispatched via ${challanNumber}`)
        }));

        await ToolMovement.insertMany(movementLogs, saveOptions);

        // Audit log
        if (sourceDc) {
            const sourceAudit = new ChallanAuditLog({
                user: createdBy,
                action: 'DC Transfer Out',
                referenceNumber: sourceDc.challanNumber,
                details: `Transferred ${items.length} tools from ${sourceDc.challanNumber} to new Delivery Challan ${challanNumber} for site ${siteCode || 'new site'}`,
                metadata: { newChallanNumber: challanNumber, toolCount: items.length }
            });
            await sourceAudit.save(saveOptions);

            const newAudit = new ChallanAuditLog({
                user: createdBy,
                action: 'DC Transfer In',
                referenceNumber: challanNumber,
                details: `Created Transfer Delivery Challan ${challanNumber} with ${items.length} tools transferred from ${sourceDc.challanNumber}`,
                metadata: { transferFrom: sourceDc.challanNumber, toolCount: items.length }
            });
            await newAudit.save(saveOptions);
        } else {
            const auditLog = new ChallanAuditLog({
                user: createdBy,
                action: 'DC Creation',
                referenceNumber: challanNumber,
                details: `Created Delivery Challan ${challanNumber} with ${items.length} tools for vendor ${vendorSnapshot.name}`,
                metadata: { toolCount: items.length, vendorName: vendorSnapshot.name }
            });
            await auditLog.save(saveOptions);
        }

        // Update vendor metrics
        if (vendorDoc._id) {
            await vendorService.updateVendorMetrics(vendorDoc._id, { dcDelta: 1 }, session);
        }

        return challan;
    });
};

/**
 * Create Scrap Delivery Challan (DC) for transferring tools to a Scrap Dealer
 */
export const createScrapDeliveryChallan = async (data, user = {}) => {
    const {
        scrapDealerId,
        storeId,
        siteCode = '',
        locationChainage = '',
        workFrontLocation = '',
        trnCode = '',
        sendingCentreCode = '',
        mrNo = '',
        mrDate = '',
        stockType = '',
        ewayBillNo = '',
        gatePassNo = '',
        gatePassApprovedBy = '',
        consignorTaxNo = '',
        vehicleNo = '',
        lrNo = '',
        freightStatus = '',
        receiverName = '',
        receiverMobile = '',
        mrnNo = '',
        receiptDate = '',
        challanDate,
        deliveryDate,
        remarks = '',
        notes = '',
        items = []
    } = data;

    if (!items || items.length === 0) {
        throw new Error('At least one tool item is required to create a Scrap Delivery Challan');
    }

    const cleanSiteCode = typeof siteCode === 'string' ? siteCode.trim() : '';

    if (!scrapDealerId) {
        throw new Error('Scrap Dealer selection is required');
    }

    let scrapDealer = null;
    try {
        scrapDealer = await profileService.getProfileById(scrapDealerId);
    } catch (e) {
        // Fallback check
        scrapDealer = await vendorService.getVendorById(scrapDealerId);
    }

    if (!scrapDealer) {
        throw new Error('Selected Scrap Dealer profile not found');
    }

    return await runInTransaction(async (session) => {
        const challanNumber = await generateChallanNumber('Delivery', session);

        const scrapDealerSnapshot = {
            _id: scrapDealer._id,
            name: scrapDealer.name,
            vendorCode: scrapDealer.code || scrapDealer.vendorCode || `SCR-${scrapDealer._id.toString().substring(0, 6).toUpperCase()}`,
            address: scrapDealer.address || '',
            gstNumber: scrapDealer.gstNumber || '',
            licenseNumber: scrapDealer.licenseNumber || '',
            contactPerson: scrapDealer.contactPerson || '',
            contactPhone: scrapDealer.contactPhone || ''
        };

        const createdBy = {
            _id: user._id || null,
            name: user.name || user.username || 'System User',
            email: user.email || 'system@landt.com'
        };

        const challan = new Challan({
            challanNumber,
            challanType: 'Delivery',
            isScrapDC: true,
            status: 'Completed',
            siteCode: cleanSiteCode || '',
            vendorCode: scrapDealerSnapshot.vendorCode,
            subcontractorName: scrapDealerSnapshot.name,
            locationChainage,
            workFrontLocation,
            trnCode,
            sendingCentreCode,
            mrNo,
            mrDate,
            stockType,
            ewayBillNo,
            gatePassNo,
            gatePassApprovedBy,
            consignorTaxNo,
            vehicleNo,
            lrNo,
            freightStatus,
            receiverName: receiverName || scrapDealerSnapshot.contactPerson || scrapDealerSnapshot.name,
            receiverMobile: receiverMobile || scrapDealerSnapshot.contactPhone || '',
            mrnNo,
            receiptDate,
            vendor: scrapDealerSnapshot,
            store: storeId || null,
            challanDate: challanDate ? new Date(challanDate) : new Date(),
            deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
            remarks: remarks || `Scrap Transfer to ${scrapDealerSnapshot.name}`,
            notes: notes || `Scrap Delivery Challan generated for ${items.length} tools`,
            items: items.map(it => ({
                ...it,
                returnStatus: 'Sent'
            })),
            toolCount: items.length,
            createdBy
        });

        const saveOptions = session ? { session } : {};
        await challan.save(saveOptions);

        // Update Tool Status to 'Scrapped' & set isScrapped: true
        const toolIds = items.map(i => i.tool);
        const updateOptions = session ? { session } : {};
        await Tool.updateMany(
            { _id: { $in: toolIds } },
            {
                $set: {
                    status: 'Scrapped',
                    isScrapped: true,
                    scrappedAt: new Date(),
                    scrappedBy: createdBy,
                    scrapReason: remarks || notes || `Dispatched to Scrap Dealer: ${scrapDealerSnapshot.name}`
                }
            },
            updateOptions
        );

        // Log Tool Movements
        const movementLogs = items.map(item => ({
            tool: item.tool,
            toolIdStr: item.toolId,
            description: item.description || '',
            movementType: 'Delivery',
            from: 'Store',
            to: `Scrap Dealer: ${scrapDealerSnapshot.name}`,
            referenceNumber: challanNumber,
            date: new Date(),
            user: createdBy.name,
            remarks: remarks || `Scrapped and dispatched via ${challanNumber}`
        }));

        const insertOptions = session ? { session } : {};
        await ToolMovement.insertMany(movementLogs, insertOptions);

        // Audit log
        const auditLog = new ChallanAuditLog({
            user: createdBy,
            action: 'Scrap DC Creation',
            referenceNumber: challanNumber,
            details: `Created Scrap Delivery Challan ${challanNumber} with ${items.length} tools for Scrap Dealer ${scrapDealerSnapshot.name}`,
            metadata: { toolCount: items.length, scrapDealerName: scrapDealerSnapshot.name }
        });
        await auditLog.save(saveOptions);

        // Update profile metrics
        await profileService.updateProfileMetrics(scrapDealer._id, { dcDelta: 1, scrapDelta: items.length }, session);

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

        // Mark reference DC as Completed
        referenceDc.status = 'Completed';
        referenceDc.returnedCount = returnedItems.length;
        referenceDc.missingCount = missingItems.length;
        await referenceDc.save(saveOptions);

        // If this DC was transferred from another DC (or chain of transfers), update all source DCs to 'Completed'
        let currTransferSourceId = referenceDc.transferFromDcId;
        let currTransferSourceNumber = referenceDc.transferFromDcNumber;
        const visitedSourceKeys = new Set();
        while (currTransferSourceId || currTransferSourceNumber) {
            const key = String(currTransferSourceId || currTransferSourceNumber);
            if (visitedSourceKeys.has(key)) break;
            visitedSourceKeys.add(key);

            let sourceDc = null;
            if (currTransferSourceId) {
                sourceDc = await Challan.findById(currTransferSourceId);
            }
            if (!sourceDc && currTransferSourceNumber) {
                sourceDc = await Challan.findOne({ challanNumber: currTransferSourceNumber });
            }
            if (!sourceDc) break;

            sourceDc.status = 'Completed';
            sourceDc.returnedCount = returnedItems.length;
            sourceDc.missingCount = missingItems.length;
            await sourceDc.save(saveOptions);

            try {
                const sourceAuditLog = new ChallanAuditLog({
                    user: createdBy,
                    action: 'Status Change',
                    referenceNumber: sourceDc.challanNumber,
                    details: `Source transfer DC ${sourceDc.challanNumber} marked as Completed following return of ${referenceDc.challanNumber} via RC ${challanNumber}`,
                    metadata: { rcNumber: challanNumber, activeDcNumber: referenceDc.challanNumber }
                });
                await sourceAuditLog.save(saveOptions);
            } catch (sourceAuditErr) {
                console.error('[createReturnChallan] Source audit log warning:', sourceAuditErr.message);
            }

            currTransferSourceId = sourceDc.transferFromDcId;
            currTransferSourceNumber = sourceDc.transferFromDcNumber;
        }

        // Process Returned Tools -> status: 'Available'
        if (returnedItems.length > 0) {
            const returnedToolIds = returnedItems.map(i => i.tool?._id || i.tool).filter(Boolean);
            const returnedToolIdStrings = returnedItems.map(i => i.toolId).filter(Boolean);

            await Tool.updateMany(
                {
                    $or: [
                        { _id: { $in: returnedToolIds } },
                        { toolId: { $in: returnedToolIdStrings } }
                    ]
                },
                { $set: { status: 'Available' } },
                session ? { session } : {}
            );

            const returnLogs = returnedItems.map(item => ({
                tool: item.tool?._id || item.tool,
                toolIdStr: item.toolId,
                description: item.description || '',
                movementType: 'Return',
                from: referenceDc.vendor?.name || 'Subcontractor',
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
            const missingToolIds = missingItems.map(i => i.tool?._id || i.tool).filter(Boolean);
            const missingToolIdStrings = missingItems.map(i => i.toolId).filter(Boolean);

            await Tool.updateMany(
                {
                    $or: [
                        { _id: { $in: missingToolIds } },
                        { toolId: { $in: missingToolIdStrings } }
                    ]
                },
                { $set: { status: 'Missing' } },
                session ? { session } : {}
            );

            const missingLogs = missingItems.map(item => ({
                tool: item.tool?._id || item.tool,
                toolIdStr: item.toolId,
                description: item.description || '',
                movementType: 'Missing',
                from: referenceDc.vendor?.name || 'Subcontractor',
                to: 'Missing',
                referenceNumber: challanNumber,
                date: new Date(),
                user: createdBy.name,
                remarks: item.remarks || `Flagged as missing on return ${challanNumber}`
            }));
            await ToolMovement.insertMany(missingLogs, session ? { session } : {});

            const missingRecords = missingItems.map(item => ({
                tool: item.tool?._id || item.tool,
                toolIdStr: item.toolId,
                description: item.description || '',
                toolCode: item.toolCode || '',
                vendor: referenceDc.vendor?._id,
                vendorName: referenceDc.vendor?.name,
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
        try {
            const auditLog = new ChallanAuditLog({
                user: createdBy,
                action: 'RC Creation',
                referenceNumber: challanNumber,
                details: `Created Return Challan ${challanNumber} for DC ${referenceDc.challanNumber} (${returnedItems.length} returned, ${missingItems.length} missing)`,
                metadata: { returnedCount: returnedItems.length, missingCount: missingItems.length, dcNumber: referenceDc.challanNumber }
            });
            await auditLog.save(saveOptions);
        } catch (auditErr) {
            console.error('[createReturnChallan] Audit log warning:', auditErr.message);
        }

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

    const conditions = [];

    if (search) {
        conditions.push({
            $or: [
                { challanNumber: { $regex: search, $options: 'i' } },
                { 'vendor.name': { $regex: search, $options: 'i' } },
                { 'vendor.vendorCode': { $regex: search, $options: 'i' } },
                { remarks: { $regex: search, $options: 'i' } },
                { referenceDcNumber: { $regex: search, $options: 'i' } },
                { transferFromDcNumber: { $regex: search, $options: 'i' } },
                { transferredToDcNumber: { $regex: search, $options: 'i' } },
                { siteCode: { $regex: search, $options: 'i' } }
            ]
        });
    }

    if (vendor && vendor !== 'All') {
        if (mongoose.Types.ObjectId.isValid(vendor)) {
            const objId = new mongoose.Types.ObjectId(vendor);
            conditions.push({
                $or: [
                    { 'vendor._id': vendor },
                    { 'vendor._id': objId },
                    { 'vendor.name': vendor },
                    { 'vendor.vendorCode': vendor }
                ]
            });
        } else {
            conditions.push({
                $or: [
                    { 'vendor._id': vendor },
                    { 'vendor.name': { $regex: vendor, $options: 'i' } },
                    { 'vendor.vendorCode': { $regex: vendor, $options: 'i' } }
                ]
            });
        }
    }

    if (status && status !== 'All') {
        if (status === 'Returned' || status === 'Completed') {
            conditions.push({ status: { $in: ['Returned', 'Completed'] } });
        } else {
            conditions.push({ status });
        }
    }

    if (challanType && challanType !== 'All') {
        conditions.push({ challanType });
    }

    if (startDate || endDate) {
        const dateCond = {};
        if (startDate) dateCond.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateCond.$lte = end;
        }
        conditions.push({ challanDate: dateCond });
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};

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

    const normalizedData = data.map(c => ({
        ...c,
        status: (c.status === 'Returned' ? 'Completed' : c.status)
    }));

    return {
        data: normalizedData,
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
    if (challan.status === 'Returned') {
        challan.status = 'Completed';
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
