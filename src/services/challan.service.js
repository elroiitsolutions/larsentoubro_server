import mongoose from 'mongoose';
import { Challan } from '../models/challan.model.js';
import { Counter } from '../models/counter.model.js';
import { Tool } from '../models/tool.model.js';
import { ToolMovement } from '../models/toolMovement.model.js';
import { MissingTool } from '../models/missingTool.model.js';
import { ChallanAuditLog } from '../models/challanAuditLog.model.js';
import { Vendor } from '../models/vendor.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';
import * as vendorService from './vendor.service.js';
import * as profileService from './profile.service.js';

/**
 * [SHARED] & [APP] Challan Service
 * Business logic, counter allocation, tool movement tracking, and audit logging for Delivery, Return, and Scrap Challans.
 * - [SHARED]: Core creation, updates, PDF logging, querying, and reconciliation across Web and Mobile.
 * - [APP]: cancelDeliveryChallan (Exclusively invoked by Mobile App challan details).
 */

/**
 * [SHARED] generateChallanNumber - Helper to generate sequential Challan numbers like DC-26-001 or RC-26-001
 * - Counter resets per year (using year in counterId)
 * - DC and RC have separate counters
 * - Atomic $inc operation ensures concurrency safety
 * - Minimum 3-digit padding (001, 002... 999, 1000...)
 */
export const generateChallanNumber = async (type, session = null) => {
    const fullYear = new Date().getFullYear();
    const shortYear = String(fullYear).slice(-2);
    const isScrapType = ['scrap', 'scrapdc', 'sdc'].includes(String(type).toLowerCase());
    const counterId = isScrapType ? `challan_scrap_${fullYear}` : `challan_${type.toLowerCase()}_${fullYear}`;
    const prefix = type === 'Delivery' ? 'DC' : type === 'Return' ? 'RC' : isScrapType ? 'SDC' : 'STC';

    // Self-healing: Find maximum existing serial number for this type and year in database
    const regex = new RegExp(`^${prefix}-${shortYear}-(\\d+)$`, 'i');
    const queryOptions = session ? { session } : {};
    let queryFilter = { challanType: type, challanNumber: { $regex: regex } };
    if (isScrapType) {
        queryFilter = {
            $or: [
                { isScrapDC: true },
                { challanType: 'Scrap' }
            ],
            challanNumber: { $regex: regex }
        };
    }

    const existingChallans = await Challan.find(
        queryFilter,
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

    // If counter is missing or out of sync (lower than actual maxSeq in DB), set counter to maxSeq
    const currentCounter = await Counter.findById(counterId, null, queryOptions);
    if (!currentCounter || currentCounter.seq < maxSeq) {
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
 * Create Store-to-Store Transfer Challan (STC)
 */
export const createStoreTransferChallan = async (data, user = {}, session = null) => {
    const {
        sourceStore,
        destinationStore,
        project,
        items = [],
        remarks = ''
    } = data;

    const challanNumber = await generateChallanNumber('Transfer', session);

    const createdBy = {
        _id: user._id || null,
        name: user.name || user.username || 'System User',
        email: user.email || 'system@landt.com'
    };

    const projId = (project?._id || project?.id || project);
    const validProjId = (projId && mongoose.Types.ObjectId.isValid(String(projId))) ? new mongoose.Types.ObjectId(String(projId)) : null;

    const srcStoreId = (sourceStore?._id || sourceStore?.id || sourceStore);
    const validSrcStoreId = (srcStoreId && mongoose.Types.ObjectId.isValid(String(srcStoreId))) ? new mongoose.Types.ObjectId(String(srcStoreId)) : null;

    const destStoreId = (destinationStore?._id || destinationStore?.id || destinationStore);
    const validDestStoreId = (destStoreId && mongoose.Types.ObjectId.isValid(String(destStoreId))) ? new mongoose.Types.ObjectId(String(destStoreId)) : null;

    const sourceStoreName = sourceStore?.name || 'Source Store';
    const destinationStoreName = destinationStore?.name || 'Destination Store';

    const challan = new Challan({
        challanNumber,
        challanType: 'Transfer',
        status: 'Completed',
        isStoreTransfer: true,
        project: {
            _id: validProjId,
            name: project?.name || '',
            projectCode: project?.projectCode || ''
        },
        sourceStore: {
            _id: validSrcStoreId,
            name: sourceStoreName,
            storeCode: sourceStore?.storeCode || '',
            location: sourceStore?.location || ''
        },
        destinationStore: {
            _id: validDestStoreId,
            name: destinationStoreName,
            storeCode: destinationStore?.storeCode || '',
            location: destinationStore?.location || ''
        },
        vendor: {
            name: `${sourceStoreName} -> ${destinationStoreName}`,
            vendorCode: 'STORE-TRANSFER',
            address: destinationStore?.location || ''
        },
        store: validDestStoreId,
        challanDate: new Date(),
        deliveryDate: new Date(),
        remarks: remarks || `Store-to-Store Transfer from ${sourceStoreName} to ${destinationStoreName}`,
        items: items.map(it => ({
            tool: it._id || it.tool,
            toolId: it.toolId || String(it._id || it.tool),
            description: it.description || '',
            toolCode: it.toolCode || '',
            category: it.category || it.toolType || '',
            capacity: it.capacity || '',
            safeWorkingLoad: it.safeWorkingLoad || '',
            serialNumber: it.serialNumber || '',
            makeYear: it.makeYear || '',
            quantity: 1,
            unit: 'NOS',
            returnStatus: 'Sent',
            remarks: it.remarks || ''
        })),
        toolCount: items.length,
        createdBy
    });

    const saveOptions = session ? { session } : {};
    await challan.save(saveOptions);

    const auditLog = new ChallanAuditLog({
        user: createdBy,
        action: 'Store Transfer Challan',
        referenceNumber: challanNumber,
        details: `Created Store-to-Store Transfer Challan ${challanNumber} for ${items.length} tools from ${sourceStoreName} to ${destinationStoreName}`,
        metadata: {
            toolCount: items.length,
            sourceStore: sourceStoreName,
            destinationStore: destinationStoreName,
            project: project?.name
        }
    });
    await auditLog.save(saveOptions);

    return challan;
};

/**
 * Self-healing: Backfill missing Store Transfer Challans for past TRF- transfers
 */
export const syncMissingStoreTransferChallans = async () => {
    try {
        const legacyMovements = await ToolMovement.find({
            movementType: 'Transfer',
            referenceNumber: { $regex: '^TRF-', $options: 'i' }
        }).lean();

        if (!legacyMovements || legacyMovements.length === 0) return 0;

        // Group by legacy referenceNumber
        const groupsMap = new Map();
        for (const mov of legacyMovements) {
            const ref = mov.referenceNumber;
            if (!groupsMap.has(ref)) {
                groupsMap.set(ref, []);
            }
            groupsMap.get(ref).push(mov);
        }

        let createdCount = 0;

        for (const [trfRef, movements] of groupsMap.entries()) {
            const existing = await Challan.findOne({
                $or: [
                    { challanNumber: trfRef },
                    { remarks: { $regex: trfRef, $options: 'i' } },
                    { notes: { $regex: trfRef, $options: 'i' } }
                ]
            });
            if (existing) continue;

            const toolIds = movements.map(m => m.tool).filter(Boolean);
            const tools = await Tool.find({ _id: { $in: toolIds } }).populate('store').populate('currentSite').populate('project').lean();
            const toolMap = new Map(tools.map(t => [t._id.toString(), t]));

            const firstMov = movements[0];
            const firstTool = tools[0];

            let sourceStoreName = firstMov.from ? firstMov.from.replace(/\s*\([^)]*\)/g, '').trim() : 'Source Store';
            let destStoreName = firstMov.to ? firstMov.to.replace(/\s*\([^)]*\)/g, '').trim() : 'Destination Store';

            const challanNumber = await generateChallanNumber('Transfer');

            const challanItems = movements.map(m => {
                const t = toolMap.get(m.tool?.toString()) || {};
                return {
                    tool: m.tool,
                    toolId: m.toolIdStr || t.toolId || String(m.tool),
                    description: m.description || t.description || 'Transferred Tool',
                    toolCode: t.toolCode || '',
                    category: t.toolType || t.category || '',
                    capacity: t.capacity || '',
                    safeWorkingLoad: t.safeWorkingLoad || '',
                    serialNumber: t.serialNumber || '',
                    makeYear: t.makeYear || '',
                    quantity: 1,
                    unit: 'NOS',
                    returnStatus: 'Sent',
                    remarks: m.remarks || ''
                };
            });

            const projObj = firstTool?.project ? {
                _id: firstTool.project._id,
                name: firstTool.project.name || '',
                projectCode: firstTool.project.projectCode || firstTool.project.code || ''
            } : {};

            const destStoreObj = firstTool?.currentSite || firstTool?.store;

            const challan = new Challan({
                challanNumber,
                challanType: 'Transfer',
                status: 'Completed',
                isStoreTransfer: true,
                project: projObj,
                sourceStore: {
                    name: sourceStoreName
                },
                destinationStore: {
                    _id: destStoreObj?._id,
                    name: destStoreName,
                    storeCode: destStoreObj?.storeCode || '',
                    location: destStoreObj?.location || ''
                },
                vendor: {
                    name: `${sourceStoreName} -> ${destStoreName}`,
                    vendorCode: 'STORE-TRANSFER'
                },
                store: destStoreObj?._id || null,
                challanDate: firstMov.date || firstMov.createdAt || new Date(),
                deliveryDate: firstMov.date || firstMov.createdAt || new Date(),
                remarks: firstMov.remarks || `Store Transfer from ${sourceStoreName} to ${destStoreName} (Ref: ${trfRef})`,
                notes: `Retroactively generated Transfer Challan for legacy movement ${trfRef}`,
                items: challanItems,
                toolCount: challanItems.length,
                createdBy: {
                    name: firstMov.user || 'System User',
                    email: 'system@landt.com'
                }
            });

            await challan.save();

            await ToolMovement.updateMany(
                { referenceNumber: trfRef },
                { $set: { referenceNumber: challanNumber } }
            );

            createdCount++;
        }

        return createdCount;
    } catch (err) {
        console.error('[syncMissingStoreTransferChallans] Error:', err.message);
        return 0;
    }
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
        indentNo = '',
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
        if (sourceDc.status !== 'Active' && sourceDc.status !== 'Pending') {
            throw new Error(`Cannot transfer from Challan ${sourceDc.challanNumber}: status is '${sourceDc.status}' (Must be Active or Pending)`);
        }
    }

    const toolIds = items.map(i => i.tool);
    const toolsToCheck = await Tool.find({ _id: { $in: toolIds } });

    // Ensure all tools are printed before allowing DC creation
    const unprintedTools = toolsToCheck.filter(t => !t.isPrinted);
    if (unprintedTools.length > 0) {
        const unprintedLabels = unprintedTools.map(t => t.toolId || t.toolCode || t.description || t._id.toString()).join(', ');
        const err = new Error(`Cannot create Delivery Challan: Tool(s) [${unprintedLabels}] are not marked as Printed. All selected tools must be printed before creating a Delivery Challan.`);
        err.statusCode = 400;
        throw err;
    }

    // When transferring, tools are already dispatched on source DC so status is expected to be Moving
    if (!sourceDc) {
        const invalidMoving = toolsToCheck.filter(t => t.status === 'Moving');
        if (invalidMoving.length > 0) {
            const movingToolIds = invalidMoving.map(t => t._id);
            const activeDcs = await Challan.find({
                challanType: 'Delivery',
                status: { $in: ['Active', 'Pending'] },
                'items.tool': { $in: movingToolIds }
            }).select('challanNumber siteCode subcontractorName vendor').lean();

            const dcDetails = activeDcs.map(dc => {
                const recipient = dc.subcontractorName || dc.vendor?.name || 'Subcontractor';
                const site = dc.siteCode ? ` [Site: ${dc.siteCode}]` : '';
                return `${dc.challanNumber}${site} (${recipient})`;
            }).join(', ');

            const dcSuffix = dcDetails ? ` on active Delivery Challan: ${dcDetails}` : '';
            const err = new Error(`Cannot create Delivery Challan: Tool(s) ${invalidMoving.map(t => t.toolId || t.toolCode || t._id).join(', ')} are already dispatched (status: Moving)${dcSuffix}. To re-issue, tools must first be returned via Return Challan (RC) or transferred via Site Transfer.`);
            err.statusCode = 400;
            throw err;
        }
    }

    const invalidMissing = toolsToCheck.filter(t => t.status === 'Missing');
    if (invalidMissing.length > 0) {
        const err = new Error(`Cannot create Delivery Challan: Tool(s) ${invalidMissing.map(t => t.toolId).join(', ')} are marked as Missing`);
        err.statusCode = 400;
        throw err;
    }

    const invalidRepair = toolsToCheck.filter(t => (t.status || '').toLowerCase() === 'repair');
    if (invalidRepair.length > 0) {
        const err = new Error(`Cannot create Delivery Challan: Tool(s) ${invalidRepair.map(t => t.toolId || t.description).join(', ')} are currently under Repair and cannot be issued in a Delivery Challan.`);
        err.statusCode = 400;
        throw err;
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

        let projectSnapshot = null;
        if (sourceDc && sourceDc.project && sourceDc.project._id) {
            projectSnapshot = sourceDc.project;
        } else if (toolsToCheck.length > 0 && toolsToCheck[0].project) {
            const rawProj = toolsToCheck[0].project?._id || toolsToCheck[0].project;
            if (rawProj && mongoose.Types.ObjectId.isValid(String(rawProj))) {
                const projDoc = await Project.findById(rawProj).lean();
                if (projDoc) {
                    projectSnapshot = {
                        _id: projDoc._id,
                        name: projDoc.name || '',
                        projectCode: projDoc.projectCode || ''
                    };
                }
            }
        }
        if (!projectSnapshot && storeId && mongoose.Types.ObjectId.isValid(String(storeId))) {
            const storeDoc = await Store.findById(storeId).populate('project').lean();
            if (storeDoc && storeDoc.project) {
                const p = storeDoc.project;
                projectSnapshot = {
                    _id: p._id || p,
                    name: p.name || '',
                    projectCode: p.projectCode || ''
                };
            }
        }

        const challan = new Challan({
            challanNumber,
            challanType: 'Delivery',
            status: 'Active',
            indentNo: typeof indentNo === 'string' ? indentNo.trim() : (indentNo || ''),
            project: projectSnapshot,
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
        indentNo = '',
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

    const toolIds = items.map(i => i.tool);
    const toolsToCheck = await Tool.find({ _id: { $in: toolIds } });
    const unprintedTools = toolsToCheck.filter(t => !t.isPrinted);
    if (unprintedTools.length > 0) {
        const unprintedLabels = unprintedTools.map(t => t.toolId || t.toolCode || t.description || t._id.toString()).join(', ');
        throw new Error(`Cannot create Scrap Delivery Challan: Tool(s) [${unprintedLabels}] are not marked as Printed. All selected tools must be printed before moving tools to Scrap.`);
    }

    const alreadyDisposed = toolsToCheck.filter(t => t.isDisposed);
    if (alreadyDisposed.length > 0) {
        const disposedLabels = alreadyDisposed.map(t => t.toolId || t.toolCode || t._id.toString()).join(', ');
        throw new Error(`Cannot create Scrap Delivery Challan: Tool(s) [${disposedLabels}] have already been disposed via a Delivery Challan.`);
    }

    const repairTools = toolsToCheck.filter(t => t.status === 'Repair');
    if (repairTools.length > 0) {
        const repairLabels = repairTools.map(t => t.toolId || t.toolCode || t._id.toString()).join(', ');
        throw new Error(`Cannot create Scrap Delivery Challan: Tool(s) [${repairLabels}] are currently under Repair and cannot be disposed.`);
    }

    return await runInTransaction(async (session) => {
        const challanNumber = await generateChallanNumber('Scrap', session);

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

        let projectSnapshot = null;
        if (toolsToCheck.length > 0 && toolsToCheck[0].project) {
            const rawProjId = toolsToCheck[0].project?._id || toolsToCheck[0].project;
            if (rawProjId && mongoose.Types.ObjectId.isValid(String(rawProjId))) {
                const projDoc = await Project.findById(rawProjId).lean();
                if (projDoc) {
                    projectSnapshot = {
                        _id: projDoc._id,
                        name: projDoc.name || '',
                        projectCode: projDoc.projectCode || ''
                    };
                }
            }
        }

        let sourceStoreSnapshot = null;
        const rawStoreId = (storeId && storeId !== 'undefined' && storeId !== 'null') 
            ? storeId 
            : (toolsToCheck.length > 0 ? (toolsToCheck[0].currentSite?._id || toolsToCheck[0].currentSite || toolsToCheck[0].store?._id || toolsToCheck[0].store) : null);
        const validStoreId = (rawStoreId && mongoose.Types.ObjectId.isValid(String(rawStoreId))) 
            ? String(rawStoreId) 
            : null;
        if (validStoreId) {
            const storeDoc = await Store.findById(validStoreId).lean();
            if (storeDoc) {
                sourceStoreSnapshot = {
                    _id: storeDoc._id,
                    name: storeDoc.name || '',
                    storeCode: storeDoc.storeCode || '',
                    location: storeDoc.location || ''
                };
            }
        }

        const challan = new Challan({
            challanNumber,
            challanType: 'Scrap',
            isScrapDC: true,
            status: 'Completed',
            indentNo: typeof indentNo === 'string' ? indentNo.trim() : (indentNo || ''),
            project: projectSnapshot,
            sourceStore: sourceStoreSnapshot,
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
            store: validStoreId || null,
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

        // Update Tool Status to 'Scrapped', isScrapped: true, and mark as Disposed
        const updateOptions = session ? { session } : {};
        await Tool.updateMany(
            { _id: { $in: toolIds } },
            {
                $set: {
                    status: 'Scrapped',
                    isScrapped: true,
                    isDisposed: true,
                    disposedAt: new Date(),
                    disposalChallanId: challan._id,
                    disposalChallanNumber: challanNumber,
                    scrapDealer: scrapDealer._id,
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

    if (!['Active', 'Pending'].includes(referenceDc.status)) {
        if (referenceDc.status === 'Completed' || referenceDc.status === 'Returned') {
            throw new Error(`All tools for Delivery Challan ${referenceDc.challanNumber} have already been returned (DC is Completed)`);
        }
        throw new Error(`Return Challan cannot be created because DC status is '${referenceDc.status}' (Must be Active or Pending)`);
    }

    if (!items || items.length === 0) {
        throw new Error('At least one tool item is required to create a Return Challan');
    }

    // Validate that none of the selected items were already returned
    for (const item of items) {
        const rawTool = item.tool?._id || item.tool || item._id;
        const matchingDcItem = (referenceDc.items || []).find(ri => 
            (rawTool && ri.tool && String(ri.tool) === String(rawTool)) ||
            (item.toolId && ri.toolId === item.toolId)
        );
        if (matchingDcItem && (matchingDcItem.returnStatus === 'Returned' || matchingDcItem.returnStatus === 'Missing')) {
            throw new Error(`Tool ${item.toolId || 'item'} has already been returned or marked missing against Delivery Challan ${referenceDc.challanNumber}`);
        }
    }

    const returnToolIds = items.map(i => i.tool).filter(Boolean);
    if (returnToolIds.length > 0) {
        const toolsUnderRepair = await Tool.find({ _id: { $in: returnToolIds }, status: 'Repair' });
        if (toolsUnderRepair.length > 0) {
            const repairNames = toolsUnderRepair.map(t => t.toolId || t.toolCode || t._id).join(', ');
            throw new Error(`The following tool(s) are currently under Repair and cannot be processed in a Return Challan: ${repairNames}`);
        }
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
            project: referenceDc.project || null,
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

        // Update individual item statuses on the reference DC
        for (const item of items) {
            const rawTool = item.tool?._id || item.tool || item._id;
            const dcItem = (referenceDc.items || []).find(ri => 
                (rawTool && ri.tool && String(ri.tool) === String(rawTool)) ||
                (item.toolId && ri.toolId === item.toolId)
            );
            if (dcItem) {
                dcItem.returnStatus = item.returnStatus; // 'Returned' | 'Missing'
                dcItem.returnedAt = new Date();
                dcItem.returnChallanNumber = challanNumber;
                dcItem.returnChallanId = challan._id;
                if (item.remarks) {
                    dcItem.remarks = item.remarks;
                }
            }
        }

        // Calculate cumulative returned, missing, and pending counts on reference DC
        let totalDcReturned = 0;
        let totalDcMissing = 0;
        for (const it of (referenceDc.items || [])) {
            if (it.returnStatus === 'Returned') totalDcReturned++;
            else if (it.returnStatus === 'Missing') totalDcMissing++;
        }
        const totalDcItems = (referenceDc.items || []).length;
        const isAllReturnedOrMissing = (totalDcReturned + totalDcMissing) >= totalDcItems;

        referenceDc.returnedCount = totalDcReturned;
        referenceDc.missingCount = totalDcMissing;
        referenceDc.status = isAllReturnedOrMissing ? 'Completed' : 'Pending';
        await referenceDc.save(saveOptions);

        // If this DC was transferred from another DC (or chain of transfers), update all source DCs
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

            sourceDc.returnedCount = totalDcReturned;
            sourceDc.missingCount = totalDcMissing;
            sourceDc.status = isAllReturnedOrMissing ? 'Completed' : 'Pending';
            await sourceDc.save(saveOptions);

            try {
                const sourceAuditLog = new ChallanAuditLog({
                    user: createdBy,
                    action: 'Status Change',
                    referenceNumber: sourceDc.challanNumber,
                    details: `Source transfer DC ${sourceDc.challanNumber} status updated to ${sourceDc.status} (${totalDcReturned}/${totalDcItems} returned) following RC ${challanNumber}`,
                    metadata: { rcNumber: challanNumber, activeDcNumber: referenceDc.challanNumber, status: sourceDc.status }
                });
                await sourceAuditLog.save(saveOptions);
            } catch (sourceAuditErr) {
                console.error('[createReturnChallan] Source audit log warning:', sourceAuditErr.message);
            }

            currTransferSourceId = sourceDc.transferFromDcId;
            currTransferSourceNumber = sourceDc.transferFromDcNumber;
        }

        const dcStoreId = referenceDc.store || referenceDc.sourceStore?._id || referenceDc.sourceStore || null;
        let dcProjectId = (referenceDc.project && referenceDc.project._id) ? referenceDc.project._id : (mongoose.Types.ObjectId.isValid(String(referenceDc.project)) ? referenceDc.project : null);
        if (!dcProjectId && dcStoreId) {
            const dcStoreDoc = await Store.findById(dcStoreId).lean();
            if (dcStoreDoc?.project) {
                dcProjectId = dcStoreDoc.project;
            }
        }

        if (!dcProjectId && referenceDc.items && referenceDc.items.length > 0) {
            const firstRefToolId = referenceDc.items[0]?.tool;
            if (firstRefToolId && mongoose.Types.ObjectId.isValid(String(firstRefToolId))) {
                const firstToolDoc = await Tool.findById(firstRefToolId).lean();
                if (firstToolDoc?.project) {
                    dcProjectId = firstToolDoc.project;
                }
            }
        }

        // Helper to accurately resolve unique Tool ObjectId for any item record, preventing cross-project Tool ID ambiguity
        const resolveToolObjectId = (item) => {
            const rawTool = item.tool?._id || item.tool || item._id;
            if (rawTool && mongoose.Types.ObjectId.isValid(String(rawTool))) {
                return new mongoose.Types.ObjectId(String(rawTool));
            }
            // Match against referenceDc.items using toolId
            if (item.toolId && referenceDc.items) {
                const refItem = referenceDc.items.find(ri => 
                    (ri.tool && String(ri.tool) === String(rawTool)) ||
                    (ri.toolId && ri.toolId === item.toolId)
                );
                if (refItem && refItem.tool && mongoose.Types.ObjectId.isValid(String(refItem.tool))) {
                    return new mongoose.Types.ObjectId(String(refItem.tool));
                }
            }
            return null;
        };

        // Process Returned Tools -> status: 'Available'
        if (returnedItems.length > 0) {
            const returnedToolIds = returnedItems.map(resolveToolObjectId).filter(Boolean);
            if (returnedToolIds.length > 0) {
                const queryOptions = session ? { session } : {};
                const toolsToValidate = await Tool.find({ _id: { $in: returnedToolIds } }, null, queryOptions);
                const validReturnedToolIds = [];

                for (const t of toolsToValidate) {
                    const toolProjId = t.project?._id || t.project;
                    const toolSiteId = t.currentSite?._id || t.currentSite || t.store;
                    const cleanDcProjectId = dcProjectId && mongoose.Types.ObjectId.isValid(String(dcProjectId)) ? String(dcProjectId) : null;
                    const cleanDcStoreId = dcStoreId && mongoose.Types.ObjectId.isValid(String(dcStoreId)) ? String(dcStoreId) : null;

                    const projectMismatch = (cleanDcProjectId && toolProjId && String(toolProjId) !== cleanDcProjectId);
                    const storeMismatch = (cleanDcStoreId && toolSiteId && String(toolSiteId) !== cleanDcStoreId);
                    const isExplicitDcTool = (referenceDc.items || []).some(ri => ri.tool && String(ri.tool) === String(t._id));

                    if (isExplicitDcTool || (!projectMismatch && !storeMismatch)) {
                        validReturnedToolIds.push(t._id);
                    } else {
                        console.warn(`[createReturnChallan] Tool ${t._id} (${t.toolId}) does not match DC project/store context; skipping status update.`);
                    }
                }

                if (validReturnedToolIds.length > 0) {
                    await Tool.updateMany(
                        { _id: { $in: validReturnedToolIds } },
                        { $set: { status: 'Available' } },
                        session ? { session } : {}
                    );
                }
            }

            const returnLogs = returnedItems.map(item => {
                const toolObjId = resolveToolObjectId(item);
                return {
                    tool: toolObjId,
                    toolIdStr: item.toolId,
                    description: item.description || '',
                    movementType: 'Return',
                    from: referenceDc.vendor?.name || 'Subcontractor',
                    to: 'Store',
                    referenceNumber: challanNumber,
                    date: new Date(),
                    user: createdBy.name,
                    remarks: item.remarks || `Returned via ${challanNumber}`
                };
            });
            await ToolMovement.insertMany(returnLogs, session ? { session } : {});
        }

        // Process Missing Tools -> status: 'Missing' & save in MissingTool
        if (missingItems.length > 0) {
            const missingToolIds = missingItems.map(resolveToolObjectId).filter(Boolean);
            if (missingToolIds.length > 0) {
                const queryOptions = session ? { session } : {};
                const toolsToValidate = await Tool.find({ _id: { $in: missingToolIds } }, null, queryOptions);
                const validMissingToolIds = [];

                for (const t of toolsToValidate) {
                    const toolProjId = t.project?._id || t.project;
                    const toolSiteId = t.currentSite?._id || t.currentSite || t.store;
                    const cleanDcProjectId = dcProjectId && mongoose.Types.ObjectId.isValid(String(dcProjectId)) ? String(dcProjectId) : null;
                    const cleanDcStoreId = dcStoreId && mongoose.Types.ObjectId.isValid(String(dcStoreId)) ? String(dcStoreId) : null;

                    const projectMismatch = (cleanDcProjectId && toolProjId && String(toolProjId) !== cleanDcProjectId);
                    const storeMismatch = (cleanDcStoreId && toolSiteId && String(toolSiteId) !== cleanDcStoreId);
                    const isExplicitDcTool = (referenceDc.items || []).some(ri => ri.tool && String(ri.tool) === String(t._id));

                    if (isExplicitDcTool || (!projectMismatch && !storeMismatch)) {
                        validMissingToolIds.push(t._id);
                    } else {
                        console.warn(`[createReturnChallan] Tool ${t._id} (${t.toolId}) does not match DC project/store context; skipping status update to prevent cross-project corruption.`);
                    }
                }

                if (validMissingToolIds.length > 0) {
                    await Tool.updateMany(
                        { _id: { $in: validMissingToolIds } },
                        { $set: { status: 'Missing' } },
                        session ? { session } : {}
                    );
                }
            }

            const missingLogs = missingItems.map(item => {
                const toolObjId = resolveToolObjectId(item);
                return {
                    tool: toolObjId,
                    toolIdStr: item.toolId,
                    description: item.description || '',
                    movementType: 'Missing',
                    from: referenceDc.vendor?.name || 'Subcontractor',
                    to: 'Missing',
                    referenceNumber: challanNumber,
                    date: new Date(),
                    user: createdBy.name,
                    remarks: item.remarks || `Flagged as missing on return ${challanNumber}`
                };
            });
            await ToolMovement.insertMany(missingLogs, session ? { session } : {});

            const missingRecords = missingItems.map(item => {
                const toolObjId = resolveToolObjectId(item);
                return {
                    tool: toolObjId,
                    toolIdStr: item.toolId,
                    description: item.description || '',
                    toolCode: item.toolCode || '',
                    project: dcProjectId || null,
                    store: dcStoreId || null,
                    vendor: referenceDc.vendor?._id,
                    vendorName: referenceDc.vendor?.name,
                    dcNumber: referenceDc.challanNumber,
                    rcNumber: challanNumber,
                    missingDate: new Date(),
                    reportedBy: createdBy.name,
                    remarks: item.remarks || 'Tool not returned against Delivery Challan',
                    status: 'Missing'
                };
            });
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
 * Self-healing reconciliation: Ensures tools marked as 'Missing' actually
 * correspond to a valid Return Challan item / MissingTool record for their
 * specific project and store. Reverts erroneously marked tools with the same
 * toolId in other projects back to 'Available'.
 */
export const reconcileMissingToolStatuses = async () => {
    try {
        const missingTools = await Tool.find({ status: 'Missing', isDeleted: { $ne: true }, isScrapped: { $ne: true } })
            .select('_id toolId project currentSite status')
            .lean();

        if (!missingTools || missingTools.length === 0) return;

        const toolsToRestore = [];

        for (const t of missingTools) {
            // Check 1: Is there a MissingTool record explicitly pointing to this tool's unique _id, or matching toolIdStr + project?
            const missingConditions = [
                { tool: t._id },
                { tool: t._id.toString() }
            ];
            if (t.project) {
                missingConditions.push({ toolIdStr: t.toolId, project: t.project });
            }
            if (t.currentSite) {
                missingConditions.push({ toolIdStr: t.toolId, store: t.currentSite });
            }

            const missingRecord = await MissingTool.findOne({
                $or: missingConditions,
                status: 'Missing'
            }).lean();
            if (missingRecord) continue;

            // Check 2: Is this tool's unique _id in any Return Challan with returnStatus: 'Missing'?
            const rcConditions = [
                {
                    items: {
                        $elemMatch: {
                            $or: [
                                { tool: t._id },
                                { tool: t._id.toString() }
                            ],
                            returnStatus: 'Missing'
                        }
                    }
                }
            ];
            if (t.project) {
                rcConditions.push({
                    $or: [
                        { project: t.project },
                        { 'project._id': t.project },
                        { 'project._id': t.project.toString() }
                    ],
                    items: {
                        $elemMatch: {
                            toolId: t.toolId,
                            returnStatus: 'Missing'
                        }
                    }
                });
            }

            const rcWithTool = await Challan.findOne({
                challanType: 'Return',
                $or: rcConditions
            }).lean();
            if (rcWithTool) continue;

            // If neither exists, this tool record in another project was erroneously marked as Missing
            toolsToRestore.push(t._id);
        }

        if (toolsToRestore.length > 0) {
            console.log(`[reconcileMissingToolStatuses] Restoring ${toolsToRestore.length} falsely marked missing tool(s) back to Available:`, toolsToRestore);
            await Tool.updateMany(
                { _id: { $in: toolsToRestore } },
                { $set: { status: 'Available' } }
            );
        }
    } catch (err) {
        console.error('[reconcileMissingToolStatuses] Error reconciling missing tool statuses:', err.message);
    }
};

/**
 * Self-healing reconciliation: Ensures tools marked as 'Moving' that have
 * actually been returned via a completed Return Challan are reverted back to 'Available',
 * provided they are not currently active on a newer Delivery Challan.
 */
export const reconcileReturnedToolStatuses = async () => {
    try {
        const movingTools = await Tool.find({
            status: { $in: ['Moving', 'In Transit', 'transit'] },
            isDeleted: { $ne: true },
            isScrapped: { $ne: true }
        }).select('_id toolId status').lean();

        if (!movingTools || movingTools.length === 0) return;

        const toolsToRestore = [];

        for (const t of movingTools) {
            // Find latest Return Challan containing this tool where returnStatus is 'Returned'
            const latestRc = await Challan.findOne({
                challanType: 'Return',
                status: 'Completed',
                items: {
                    $elemMatch: {
                        $or: [
                            { tool: t._id },
                            { tool: t._id.toString() }
                        ],
                        returnStatus: 'Returned'
                    }
                }
            }).sort({ createdAt: -1 }).select('createdAt items').lean();

            if (!latestRc) continue;

            // Check if there is a newer active Delivery Challan dispatching this tool after this return
            const newerActiveDc = await Challan.findOne({
                challanType: 'Delivery',
                status: { $in: ['Active', 'Pending'] },
                createdAt: { $gt: latestRc.createdAt },
                items: {
                    $elemMatch: {
                        $or: [
                            { tool: t._id },
                            { tool: t._id.toString() }
                        ]
                    }
                }
            }).select('_id').lean();

            if (!newerActiveDc) {
                toolsToRestore.push(t._id);
            }
        }

        if (toolsToRestore.length > 0) {
            console.log(`[reconcileReturnedToolStatuses] Restoring ${toolsToRestore.length} returned tool(s) back to Available:`, toolsToRestore);
            await Tool.updateMany(
                { _id: { $in: toolsToRestore } },
                { $set: { status: 'Available' } }
            );
        }
    } catch (err) {
        console.error('[reconcileReturnedToolStatuses] Error reconciling returned tool statuses:', err.message);
    }
};

/**
 * Self-healing reconciliation: Ensures tools marked as 'Moving' that are NOT on ANY
 * active or pending Delivery Challan are reverted back to 'Available'.
 */
export const reconcileOrphanedMovingToolStatuses = async () => {
    try {
        const movingTools = await Tool.find({
            status: { $in: ['Moving', 'In Transit', 'transit'] },
            isDeleted: { $ne: true },
            isScrapped: { $ne: true }
        }).select('_id toolId status').lean();

        if (!movingTools || movingTools.length === 0) return;

        const toolsToRestore = [];

        for (const t of movingTools) {
            const activeDc = await Challan.findOne({
                challanType: 'Delivery',
                status: { $in: ['Active', 'Pending'] },
                items: {
                    $elemMatch: {
                        $or: [
                            { tool: t._id },
                            { tool: t._id.toString() }
                        ],
                        returnStatus: { $nin: ['Returned', 'Missing'] }
                    }
                }
            }).select('_id').lean();

            if (!activeDc) {
                toolsToRestore.push(t._id);
            }
        }

        if (toolsToRestore.length > 0) {
            console.log(`[reconcileOrphanedMovingToolStatuses] Restoring ${toolsToRestore.length} orphaned moving tool(s) back to Available:`, toolsToRestore);
            await Tool.updateMany(
                { _id: { $in: toolsToRestore } },
                { $set: { status: 'Available' } }
            );
        }
    } catch (err) {
        console.error('[reconcileOrphanedMovingToolStatuses] Error reconciling orphaned moving tools:', err.message);
    }
};

/**
 * Get paginated & filtered Challans
 */
export const getChallans = async (params = {}) => {
    // Self-healing: sync any past unlinked store tool transfers to Store Transfer Challans
    await syncMissingStoreTransferChallans();
    // Self-healing: reconcile any missing tool statuses across projects
    await reconcileMissingToolStatuses();
    // Self-healing: reconcile any returned tool statuses
    await reconcileReturnedToolStatuses();
    // Self-healing: reconcile any orphaned moving tool statuses
    await reconcileOrphanedMovingToolStatuses();

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
                { 'sourceStore.name': { $regex: search, $options: 'i' } },
                { 'destinationStore.name': { $regex: search, $options: 'i' } },
                { 'project.name': { $regex: search, $options: 'i' } },
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
        if (['scrap', 'scrapdc', 'sdc'].includes(String(challanType).toLowerCase())) {
            conditions.push({
                $or: [
                    { isScrapDC: true },
                    { challanType: 'Scrap' },
                    { challanNumber: { $regex: '^SDC-', $options: 'i' } }
                ]
            });
        } else if (challanType === 'Delivery') {
            conditions.push({
                challanType: 'Delivery',
                isScrapDC: { $ne: true }
            });
        } else {
            conditions.push({ challanType });
        }
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
    const challan = await Challan.findById(id).populate('items.tool').lean();
    if (!challan) {
        throw new Error('Challan not found');
    }
    if (challan.status === 'Returned') {
        challan.status = 'Completed';
    }
    if (Array.isArray(challan.items)) {
        challan.items = challan.items.map(it => {
            const toolDoc = it.tool && typeof it.tool === 'object' ? it.tool : {};
            const matCode = it.materialCode || it.toolCode || toolDoc.toolCode || toolDoc.materialCode || '';
            return {
                ...it,
                materialCode: matCode || it.materialCode
            };
        });
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
    if (challan.challanType !== 'Delivery' || (challan.status !== 'Active' && challan.status !== 'Pending')) {
        throw new Error('Only active or pending Delivery Challans can be edited');
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

/**
 * [APP] cancelDeliveryChallan - Cancel an active Delivery Challan
 * - Exclusively invoked by Mobile App challan details screen
 * - Can only cancel if DC is 'Active' and no items have been returned or marked missing yet
 * - Restores all tools associated with this DC back to 'Available'
 * - Records ToolMovement log and ChallanAuditLog
 * - Decrements vendor DC metrics
 */
export const cancelDeliveryChallan = async (id, reason = '', user = {}) => {
    const challan = await Challan.findById(id);
    if (!challan) {
        const err = new Error('Delivery Challan not found');
        err.statusCode = 404;
        throw err;
    }

    if (challan.challanType !== 'Delivery') {
        const err = new Error(`Only Delivery Challans can be cancelled (challanType is '${challan.challanType}')`);
        err.statusCode = 400;
        throw err;
    }

    if (challan.status !== 'Active') {
        const err = new Error(`Cannot cancel Delivery Challan ${challan.challanNumber}: status is '${challan.status}' (Must be Active)`);
        err.statusCode = 400;
        throw err;
    }

    if ((challan.returnedCount || 0) > 0 || (challan.missingCount || 0) > 0) {
        const err = new Error(`Cannot cancel Delivery Challan ${challan.challanNumber}: Tools have already been processed in a Return Challan (${challan.returnedCount} returned, ${challan.missingCount} missing)`);
        err.statusCode = 400;
        throw err;
    }

    // Tools to revert back to Available
    const toolIds = (challan.items || []).map(i => i.tool).filter(Boolean);

    challan.status = 'Cancelled';
    challan.remarks = challan.remarks ? `${challan.remarks} | Cancelled: ${reason || 'Cancelled by user'}` : `Cancelled: ${reason || 'Cancelled by user'}`;
    await challan.save();

    if (toolIds.length > 0) {
        await Tool.updateMany(
            { _id: { $in: toolIds } },
            { $set: { status: 'Available' } }
        );

        const createdBy = {
            _id: user._id || null,
            name: user.name || user.username || 'System User',
            email: user.email || 'system@landt.com'
        };

        const cancelLogs = (challan.items || []).map(item => ({
            tool: item.tool,
            toolIdStr: item.toolId,
            description: item.description || '',
            movementType: 'Cancellation',
            from: challan.subcontractorName || challan.vendor?.name || 'Subcontractor',
            to: 'Store',
            referenceNumber: challan.challanNumber,
            date: new Date(),
            user: createdBy.name,
            remarks: reason || `Cancelled Delivery Challan ${challan.challanNumber}`
        }));
        await ToolMovement.insertMany(cancelLogs);

        await ChallanAuditLog.create({
            user: createdBy,
            action: 'DC Cancellation',
            referenceNumber: challan.challanNumber,
            details: `Cancelled Delivery Challan ${challan.challanNumber} (${toolIds.length} tools restored to Available). Reason: ${reason || 'Cancelled by user'}`
        });

        if (challan.vendor?._id) {
            await vendorService.updateVendorMetrics(challan.vendor._id, { dcDelta: -1 });
        }
    }

    return challan;
};

