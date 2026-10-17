import mongoose from 'mongoose';
import { Tool } from '../models/tool.model.js';
import { LoginLog } from '../models/loginLog.model.js';
import { Challan } from '../models/challan.model.js';
import { MissingTool } from '../models/missingTool.model.js';
import { Profile } from '../models/profile.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';
import { Vendor } from '../models/vendor.model.js';
import ExcelJS from 'exceljs';

/**
 * Helper to apply date range filter
 */
const applyDateRange = (query, dateField, startDate, endDate) => {
    if (startDate || endDate) {
        query[dateField] = {};
        if (startDate) query[dateField].$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query[dateField].$lte = end;
        }
    }
};

/**
 * Helper to apply status filter handling 'Moving', 'Repair', 'Scrapped', etc.
 */
const applyStatusFilter = (query, status) => {
    if (status && status !== 'All') {
        if (status === 'Moving') {
            query.status = { $in: ['Moving', 'Issued', 'In Transit'] };
        } else if (status === 'Issued') {
            query.status = { $in: ['Issued', 'Moving', 'In Transit'] };
        } else if (status === 'Repair' || status === 'Under Repair') {
            query.status = { $regex: /repair/i };
        } else if (status === 'Scrapped' || status === 'Scrap') {
            const scrapConditions = [{ status: { $regex: /scrap/i } }, { isScrapped: true }];
            if (query.$or) {
                query.$and = (query.$and || []).concat([{ $or: query.$or }, { $or: scrapConditions }]);
                delete query.$or;
            } else if (query.$and) {
                query.$and.push({ $or: scrapConditions });
            } else {
                query.$or = scrapConditions;
            }
        } else {
            query.status = status;
        }
    }
};

/**
 * Helper to scope queries for non-admin users
 */
const applyUserScope = (query, user, projectField = 'project', storeField = 'currentSite') => {
    if (!user || user.role === 'Admin') return;

    const allowedProjectIds = (user.projects || [])
        .map(p => typeof p === 'object' && p?._id ? p._id.toString() : p?.toString())
        .filter(Boolean);
    const allowedStoreIds = (user.stores || [])
        .map(s => typeof s === 'object' && s?._id ? s._id.toString() : s?.toString())
        .filter(Boolean);

    if (allowedProjectIds.length > 0) {
        const projObjectIds = allowedProjectIds.map(id => new mongoose.Types.ObjectId(id));
        if (query[projectField] && mongoose.Types.ObjectId.isValid(query[projectField])) {
            const currentProjId = query[projectField].toString();
            if (!allowedProjectIds.includes(currentProjId)) {
                query[projectField] = { $in: [] };
            }
        } else {
            query[projectField] = { $in: projObjectIds };
        }
    }

    if (allowedStoreIds.length > 0) {
        const storeObjectIds = allowedStoreIds.map(id => new mongoose.Types.ObjectId(id));
        if (query[storeField] && mongoose.Types.ObjectId.isValid(query[storeField])) {
            const currentStoreId = query[storeField].toString();
            if (!allowedStoreIds.includes(currentStoreId)) {
                query[storeField] = { $in: [] };
            }
        } else {
            query[storeField] = { $in: storeObjectIds };
        }
    }
};

// ==========================================
// 1. TOOLS & INVENTORY REGISTER REPORT
// ==========================================
export const getToolsReport = async (params = {}, user = null) => {
    const {
        page = 1,
        limit = 50,
        project = 'All',
        store = 'All',
        vendor = 'All',
        status = 'All',
        toolType = 'All',
        inspectionStatus = 'All',
        isPrinted = 'All',
        startDate,
        endDate,
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = params;

    const query = { isDeleted: { $ne: true } };

    if (project && project !== 'All' && mongoose.Types.ObjectId.isValid(project)) {
        query.project = new mongoose.Types.ObjectId(project);
    }
    if (store && store !== 'All' && mongoose.Types.ObjectId.isValid(store)) {
        query.currentSite = new mongoose.Types.ObjectId(store);
    }
    if (vendor && vendor !== 'All') {
        query.$or = [
            { supplierCode: vendor },
            { purchaserName: vendor },
            { subcontractorName: vendor }
        ];
    }
    applyStatusFilter(query, status);
    if (toolType && toolType !== 'All') query.toolType = toolType;
    if (inspectionStatus && inspectionStatus !== 'All') query.inspectionStatus = inspectionStatus;
    if (isPrinted === 'true' || isPrinted === true) query.isPrinted = true;
    if (isPrinted === 'false' || isPrinted === false) query.isPrinted = false;

    applyDateRange(query, 'createdAt', startDate, endDate);
    applyUserScope(query, user, 'project', 'currentSite');

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        const searchConditions = [
            { toolId: regex },
            { description: regex },
            { toolCode: regex },
            { subcontractorName: regex },
            { purchaserName: regex },
            { capacity: regex },
            { safeWorkingLoad: regex }
        ];
        if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: searchConditions }];
            delete query.$or;
        } else {
            query.$or = searchConditions;
        }
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    let sortObj = { [sortBy]: sortDir };
    if (sortBy === 'toolId' || sortBy === 'serialNumber') {
        sortObj = { serialNumber: sortDir, toolId: sortDir };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [data, total, summaryAgg] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode')
            .populate('currentSite', 'name type location')
            .sort(sortObj)
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        Tool.countDocuments(query),
        Tool.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalTools: { $sum: 1 },
                    availableCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Available'] }, 1, 0] }
                    },
                    issuedCount: {
                        $sum: { $cond: [{ $in: ['$status', ['Issued', 'In Transit', 'Moving']] }, 1, 0] }
                    },
                    repairCount: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $in: ['$status', ['Repair', 'Under Repair', 'Damaged / Under Repair', 'damaged/repair', 'Under repair']] },
                                        { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: /repair/i } }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    missingCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Missing'] }, 1, 0] }
                    },
                    scrappedCount: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $eq: ['$isScrapped', true] },
                                        { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: /scrap/i } }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    overdueCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ifNull: ['$nextInspectionDueDate', false] },
                                        { $lt: ['$nextInspectionDueDate', new Date()] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ])
    ]);

    const summary = summaryAgg[0] || {
        totalTools: total,
        availableCount: 0,
        issuedCount: 0,
        repairCount: 0,
        missingCount: 0,
        scrappedCount: 0,
        overdueCount: 0
    };

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
        summary
    };
};

// ==========================================
// 2. CHALLANS & MATERIAL TRANSFER REPORT
// ==========================================
export const getChallansReport = async (params = {}, user = null) => {
    const {
        page = 1,
        limit = 50,
        search = '',
        challanType = 'All',
        status = 'All',
        project = 'All',
        store = 'All',
        vendor = 'All',
        isOutstandingOnly = 'false',
        startDate,
        endDate,
        sortBy = 'challanDate',
        sortOrder = 'desc'
    } = params;

    const conditions = [];

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        conditions.push({
            $or: [
                { challanNumber: regex },
                { 'vendor.name': regex },
                { 'vendor.vendorCode': regex },
                { subcontractorName: regex },
                { 'sourceStore.name': regex },
                { 'destinationStore.name': regex },
                { 'project.name': regex },
                { vehicleNo: regex },
                { ewayBillNo: regex },
                { gatePassNo: regex },
                { receiverName: regex }
            ]
        });
    }

    if (challanType && challanType !== 'All') {
        if (['scrap', 'scrapdc', 'sdc'].includes(String(challanType).toLowerCase())) {
            conditions.push({
                $or: [
                    { isScrapDC: true },
                    { challanType: 'Scrap' }
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

    if (status && status !== 'All') {
        if (status === 'Returned' || status === 'Completed') {
            conditions.push({ status: { $in: ['Returned', 'Completed'] } });
        } else {
            conditions.push({ status });
        }
    }

    if (project && project !== 'All' && mongoose.Types.ObjectId.isValid(project)) {
        conditions.push({ 'project._id': new mongoose.Types.ObjectId(project) });
    }

    if (store && store !== 'All' && mongoose.Types.ObjectId.isValid(store)) {
        const storeObjId = new mongoose.Types.ObjectId(store);
        conditions.push({
            $or: [
                { 'sourceStore._id': storeObjId },
                { 'destinationStore._id': storeObjId },
                { store: storeObjId }
            ]
        });
    }

    if (vendor && vendor !== 'All') {
        if (mongoose.Types.ObjectId.isValid(vendor)) {
            const vObjId = new mongoose.Types.ObjectId(vendor);
            conditions.push({
                $or: [
                    { 'vendor._id': vObjId },
                    { 'vendor.name': vendor },
                    { subcontractorName: vendor }
                ]
            });
        } else {
            const vRegex = new RegExp(vendor, 'i');
            conditions.push({
                $or: [
                    { 'vendor.name': vRegex },
                    { 'vendor.vendorCode': vRegex },
                    { subcontractorName: vRegex }
                ]
            });
        }
    }

    if (isOutstandingOnly === 'true' || isOutstandingOnly === true) {
        conditions.push({
            challanType: 'Delivery',
            status: 'Active',
            $expr: {
                $gt: [
                    '$toolCount',
                    { $add: [{ $ifNull: ['$returnedCount', 0] }, { $ifNull: ['$missingCount', 0] }] }
                ]
            }
        });
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

    // User Scoping for non-admins
    if (user && user.role !== 'Admin') {
        const allowedProjIds = (user.projects || []).map(p => p?._id || p).filter(Boolean);
        const allowedStoreIds = (user.stores || []).map(s => s?._id || s).filter(Boolean);
        const userScopeConditions = [];

        if (allowedProjIds.length > 0) {
            const projObjs = allowedProjIds.map(id => new mongoose.Types.ObjectId(id));
            userScopeConditions.push({ 'project._id': { $in: projObjs } });
        }
        if (allowedStoreIds.length > 0) {
            const storeObjs = allowedStoreIds.map(id => new mongoose.Types.ObjectId(id));
            userScopeConditions.push({
                $or: [
                    { 'sourceStore._id': { $in: storeObjs } },
                    { 'destinationStore._id': { $in: storeObjs } }
                ]
            });
        }
        if (userScopeConditions.length > 0) {
            conditions.push({ $or: userScopeConditions });
        }
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortDir };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const skip = (pageNum - 1) * limitNum;

    const [rawChallans, total, summaryAgg] = await Promise.all([
        Challan.find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Challan.countDocuments(query),
        Challan.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalChallans: { $sum: 1 },
                    deliveryCount: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$challanType', 'Delivery'] }, { $ne: ['$isScrapDC', true] }] }, 1, 0] }
                    },
                    returnCount: {
                        $sum: { $cond: [{ $eq: ['$challanType', 'Return'] }, 1, 0] }
                    },
                    transferCount: {
                        $sum: { $cond: [{ $eq: ['$challanType', 'Transfer'] }, 1, 0] }
                    },
                    scrapCount: {
                        $sum: { $cond: [{ $or: [{ $eq: ['$challanType', 'Scrap'] }, { $eq: ['$isScrapDC', true] }] }, 1, 0] }
                    },
                    activeCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
                    },
                    completedCount: {
                        $sum: { $cond: [{ $in: ['$status', ['Completed', 'Returned']] }, 1, 0] }
                    },
                    totalToolsDispatched: {
                        $sum: { $cond: [{ $eq: ['$challanType', 'Delivery'] }, { $ifNull: ['$toolCount', 0] }, 0] }
                    },
                    totalToolsReturned: {
                        $sum: { $ifNull: ['$returnedCount', 0] }
                    },
                    totalToolsMissing: {
                        $sum: { $ifNull: ['$missingCount', 0] }
                    }
                }
            }
        ])
    ]);

    const data = rawChallans.map(c => {
        const returned = c.returnedCount || 0;
        const missing = c.missingCount || 0;
        const dispatched = c.toolCount || 0;
        const outstanding = c.challanType === 'Delivery' ? Math.max(0, dispatched - returned - missing) : 0;

        return {
            ...c,
            status: c.status === 'Returned' ? 'Completed' : c.status,
            outstandingTools: outstanding
        };
    });

    const summary = summaryAgg[0] || {
        totalChallans: total,
        deliveryCount: 0,
        returnCount: 0,
        transferCount: 0,
        scrapCount: 0,
        activeCount: 0,
        completedCount: 0,
        totalToolsDispatched: 0,
        totalToolsReturned: 0,
        totalToolsMissing: 0
    };
    summary.totalOutstandingTools = Math.max(0, summary.totalToolsDispatched - summary.totalToolsReturned - summary.totalToolsMissing);

    return {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        summary
    };
};

// ==========================================
// 3. LOSS & MISSING TOOLS AUDIT REPORT
// ==========================================
export const getMissingToolsReport = async (params = {}, user = null) => {
    const {
        page = 1,
        limit = 50,
        search = '',
        project = 'All',
        store = 'All',
        vendor = 'All',
        status = 'All',
        startDate,
        endDate,
        sortBy = 'missingDate',
        sortOrder = 'desc'
    } = params;

    const query = {};

    if (project && project !== 'All' && mongoose.Types.ObjectId.isValid(project)) {
        query.project = new mongoose.Types.ObjectId(project);
    }

    if (store && store !== 'All' && mongoose.Types.ObjectId.isValid(store)) {
        query.store = new mongoose.Types.ObjectId(store);
    }

    if (vendor && vendor !== 'All') {
        if (mongoose.Types.ObjectId.isValid(vendor)) {
            query.vendor = new mongoose.Types.ObjectId(vendor);
        } else {
            query.vendorName = { $regex: vendor, $options: 'i' };
        }
    }

    if (status && status !== 'All') {
        query.status = status;
    }

    applyDateRange(query, 'missingDate', startDate, endDate);
    applyUserScope(query, user, 'project', 'store');

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
            { toolIdStr: regex },
            { description: regex },
            { toolCode: regex },
            { vendorName: regex },
            { dcNumber: regex },
            { rcNumber: regex },
            { reportedBy: regex },
            { remarks: regex }
        ];
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortDir };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const skip = (pageNum - 1) * limitNum;

    const [data, total, summaryAgg] = await Promise.all([
        MissingTool.find(query)
            .populate('project', 'name projectCode')
            .populate('store', 'name location')
            .populate('vendor', 'name vendorCode')
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum)
            .lean(),
        MissingTool.countDocuments(query),
        MissingTool.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalMissing: { $sum: 1 },
                    uniqueVendors: { $addToSet: '$vendorName' },
                    uniqueProjects: { $addToSet: '$project' }
                }
            }
        ])
    ]);

    const summary = {
        totalMissing: total,
        uniqueVendorsCount: summaryAgg[0]?.uniqueVendors?.filter(Boolean)?.length || 0,
        uniqueProjectsCount: summaryAgg[0]?.uniqueProjects?.filter(Boolean)?.length || 0
    };

    return {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        summary
    };
};

// ==========================================
// 4. STATUTORY INSPECTION & COMPLIANCE REPORT
// ==========================================
export const getInspectionsReport = async (params = {}, user = null) => {
    const {
        page = 1,
        limit = 50,
        search = '',
        project = 'All',
        store = 'All',
        complianceStatus = 'All',
        inspectionResult = 'All',
        lifeExtension = 'All',
        startDate,
        endDate,
        sortBy = 'nextInspectionDueDate',
        sortOrder = 'asc'
    } = params;

    const query = { isDeleted: { $ne: true }, isScrapped: { $ne: true } };

    if (project && project !== 'All' && mongoose.Types.ObjectId.isValid(project)) {
        query.project = new mongoose.Types.ObjectId(project);
    }
    if (store && store !== 'All' && mongoose.Types.ObjectId.isValid(store)) {
        query.currentSite = new mongoose.Types.ObjectId(store);
    }

    const now = new Date();
    const thirtyDaysAhead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (complianceStatus === 'Overdue') {
        query.nextInspectionDueDate = { $lt: now };
    } else if (complianceStatus === 'DueSoon') {
        query.nextInspectionDueDate = { $gte: now, $lte: thirtyDaysAhead };
    } else if (complianceStatus === 'Valid') {
        query.nextInspectionDueDate = { $gt: now };
    } else if (complianceStatus === 'LifeExtended') {
        query.lifeExtensionYears = { $gt: 0 };
    }

    if (inspectionResult && inspectionResult !== 'All') {
        query.inspectionResult = inspectionResult;
    }

    if (lifeExtension === '1' || lifeExtension === '2') {
        query.lifeExtensionYears = Number(lifeExtension);
    } else if (lifeExtension === 'None') {
        query.$or = [{ lifeExtensionYears: 0 }, { lifeExtensionYears: null }, { lifeExtensionYears: { $exists: false } }];
    }

    applyDateRange(query, 'lastInspectionDate', startDate, endDate);
    applyUserScope(query, user, 'project', 'currentSite');

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        const searchConditions = [
            { toolId: regex },
            { description: regex },
            { toolCode: regex },
            { toolType: regex },
            { 'inspectedBy.name': regex },
            { extensionApprovedBy: regex }
        ];
        if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: searchConditions }];
            delete query.$or;
        } else {
            query.$or = searchConditions;
        }
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortDir };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const skip = (pageNum - 1) * limitNum;

    const [rawTools, total, summaryAgg] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode')
            .populate('currentSite', 'name location')
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Tool.countDocuments(query),
        Tool.aggregate([
            { $match: { isDeleted: { $ne: true }, isScrapped: { $ne: true } } },
            {
                $group: {
                    _id: null,
                    totalTools: { $sum: 1 },
                    overdueCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ifNull: ['$nextInspectionDueDate', false] },
                                        { $lt: ['$nextInspectionDueDate', now] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    dueSoonCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ifNull: ['$nextInspectionDueDate', false] },
                                        { $gte: ['$nextInspectionDueDate', now] },
                                        { $lte: ['$nextInspectionDueDate', thirtyDaysAhead] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    passedCount: {
                        $sum: { $cond: [{ $eq: ['$inspectionResult', 'Pass'] }, 1, 0] }
                    },
                    failedCount: {
                        $sum: { $cond: [{ $eq: ['$inspectionResult', 'Fail'] }, 1, 0] }
                    },
                    lifeExtendedCount: {
                        $sum: { $cond: [{ $gt: ['$lifeExtensionYears', 0] }, 1, 0] }
                    }
                }
            }
        ])
    ]);

    const data = rawTools.map(t => {
        const supplyDate = t.manufactureDate || (t.dateOfSupply ? new Date(t.dateOfSupply) : null) || t.createdAt;
        const toolAgeMs = supplyDate ? (now.getTime() - new Date(supplyDate).getTime()) : 0;
        const toolAgeYears = (toolAgeMs / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1);

        const dueDate = t.nextInspectionDueDate ? new Date(t.nextInspectionDueDate) : null;
        const isOverdue = dueDate ? dueDate < now : false;
        const isDueSoon = dueDate ? (dueDate >= now && dueDate <= thirtyDaysAhead) : false;
        const daysRemaining = dueDate ? Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

        return {
            ...t,
            toolAgeYears: Number(toolAgeYears) || 0,
            isOverdue,
            isDueSoon,
            daysRemaining,
            complianceBadge: isOverdue ? 'Overdue' : isDueSoon ? 'Due Soon' : dueDate ? 'Compliant' : 'Unscheduled'
        };
    });

    const summary = summaryAgg[0] || {
        totalTools: total,
        overdueCount: 0,
        dueSoonCount: 0,
        passedCount: 0,
        failedCount: 0,
        lifeExtendedCount: 0
    };

    return {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        summary
    };
};

// ==========================================
// 5. SCRAP & ASSET DISPOSAL REPORT
// ==========================================
export const getScrapReport = async (params = {}, user = null) => {
    const {
        page = 1,
        limit = 50,
        search = '',
        project = 'All',
        store = 'All',
        disposalStatus = 'All',
        scrapDealer = 'All',
        startDate,
        endDate,
        sortBy = 'scrappedAt',
        sortOrder = 'desc'
    } = params;

    const query = { isDeleted: { $ne: true }, isScrapped: true };

    if (project && project !== 'All' && mongoose.Types.ObjectId.isValid(project)) {
        query.project = new mongoose.Types.ObjectId(project);
    }
    if (store && store !== 'All' && mongoose.Types.ObjectId.isValid(store)) {
        query.currentSite = new mongoose.Types.ObjectId(store);
    }

    if (disposalStatus === 'Pending') {
        query.isDisposed = { $ne: true };
    } else if (disposalStatus === 'Disposed') {
        query.isDisposed = true;
    }

    if (scrapDealer && scrapDealer !== 'All' && mongoose.Types.ObjectId.isValid(scrapDealer)) {
        query.scrapDealer = new mongoose.Types.ObjectId(scrapDealer);
    }

    applyDateRange(query, 'scrappedAt', startDate, endDate);
    applyUserScope(query, user, 'project', 'currentSite');

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
            { toolId: regex },
            { description: regex },
            { toolCode: regex },
            { scrapReason: regex },
            { disposalChallanNumber: regex },
            { 'scrappedBy.name': regex }
        ];
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortDir };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const skip = (pageNum - 1) * limitNum;

    const [data, total, summaryAgg] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode')
            .populate('currentSite', 'name location')
            .populate('scrapDealer', 'name code vendorCode contactPerson contactPhone')
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Tool.countDocuments(query),
        Tool.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalScrapped: { $sum: 1 },
                    disposedCount: {
                        $sum: { $cond: [{ $eq: ['$isDisposed', true] }, 1, 0] }
                    },
                    pendingCount: {
                        $sum: { $cond: [{ $ne: ['$isDisposed', true] }, 1, 0] }
                    }
                }
            }
        ])
    ]);

    const summary = summaryAgg[0] || {
        totalScrapped: total,
        disposedCount: 0,
        pendingCount: 0
    };

    return {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        summary
    };
};

// ==========================================
// 6. SUBCONTRACTOR / VENDOR CUSTODY LEDGER REPORT
// ==========================================
export const getSubcontractorsReport = async (params = {}) => {
    const {
        search = '',
        complianceFilter = 'All',
        sortBy = 'holdingCount',
        sortOrder = 'desc',
        page = 1,
        limit = 50
    } = params;

    // Fetch active Profiles of type Subcontractor or Supplier, and distinct vendors from Challans
    const [subcontractorProfiles, challanStatsAgg, activeToolsAgg] = await Promise.all([
        Profile.find({
            profileType: { $in: ['Subcontractor', 'Supplier'] },
            status: 'Active'
        }).lean(),

        Challan.aggregate([
            {
                $group: {
                    _id: {
                        $ifNull: ['$subcontractorName', '$vendor.name']
                    },
                    dcCount: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$challanType', 'Delivery'] }, { $ne: ['$isScrapDC', true] }] }, 1, 0] }
                    },
                    rcCount: {
                        $sum: { $cond: [{ $eq: ['$challanType', 'Return'] }, 1, 0] }
                    },
                    totalDispatched: {
                        $sum: { $cond: [{ $eq: ['$challanType', 'Delivery'] }, { $ifNull: ['$toolCount', 0] }, 0] }
                    },
                    totalReturned: {
                        $sum: { $ifNull: ['$returnedCount', 0] }
                    },
                    totalMissing: {
                        $sum: { $ifNull: ['$missingCount', 0] }
                    }
                }
            }
        ]),

        Tool.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    subcontractorName: { $exists: true, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$subcontractorName',
                    toolCountInField: { $sum: 1 }
                }
            }
        ])
    ]);

    const challanStatsMap = new Map();
    challanStatsAgg.forEach(item => {
        if (item._id) challanStatsMap.set(String(item._id).trim().toLowerCase(), item);
    });

    const activeToolsMap = new Map();
    activeToolsAgg.forEach(item => {
        if (item._id) activeToolsMap.set(String(item._id).trim().toLowerCase(), item.toolCountInField);
    });

    // Merge profiles and distinct active subcontractor names
    const contractorMap = new Map();

    subcontractorProfiles.forEach(p => {
        const key = p.name.trim().toLowerCase();
        contractorMap.set(key, {
            _id: p._id,
            name: p.name,
            code: p.code,
            contactPerson: p.contactPerson || '-',
            contactPhone: p.contactPhone || '-',
            contactEmail: p.contactEmail || '-',
            profileType: p.profileType
        });
    });

    challanStatsAgg.forEach(cs => {
        if (!cs._id) return;
        const key = String(cs._id).trim().toLowerCase();
        if (!contractorMap.has(key)) {
            contractorMap.set(key, {
                _id: key,
                name: String(cs._id).trim(),
                code: `SUB-${key.slice(0, 4).toUpperCase()}`,
                contactPerson: '-',
                contactPhone: '-',
                contactEmail: '-',
                profileType: 'Subcontractor'
            });
        }
    });

    let records = Array.from(contractorMap.values()).map(contractor => {
        const key = contractor.name.trim().toLowerCase();
        const stats = challanStatsMap.get(key) || {
            dcCount: 0,
            rcCount: 0,
            totalDispatched: 0,
            totalReturned: 0,
            totalMissing: 0
        };

        const dispatched = stats.totalDispatched || 0;
        const returned = stats.totalReturned || 0;
        const missing = stats.totalMissing || 0;
        const toolsInField = activeToolsMap.get(key) || Math.max(0, dispatched - returned - missing);

        const compliance = dispatched > 0
            ? Math.min(100, Math.round((returned / Math.max(1, dispatched - missing)) * 100))
            : 100;

        return {
            ...contractor,
            dcCount: stats.dcCount,
            rcCount: stats.rcCount,
            totalDispatched: dispatched,
            totalReturned: returned,
            totalMissing: missing,
            holdingCount: toolsInField,
            returnComplianceRate: compliance
        };
    });

    // Filter Search
    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        records = records.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.code.toLowerCase().includes(q) ||
            r.contactPerson.toLowerCase().includes(q)
        );
    }

    // Filter Compliance
    if (complianceFilter === 'High') {
        records = records.filter(r => r.returnComplianceRate >= 90);
    } else if (complianceFilter === 'Medium') {
        records = records.filter(r => r.returnComplianceRate >= 60 && r.returnComplianceRate < 90);
    } else if (complianceFilter === 'Low') {
        records = records.filter(r => r.returnComplianceRate < 60);
    }

    // Sorting
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    records.sort((a, b) => {
        const valA = a[sortBy] ?? 0;
        const valB = b[sortBy] ?? 0;
        if (typeof valA === 'string') {
            return sortDir * valA.localeCompare(valB);
        }
        return sortDir * (valA - valB);
    });

    const total = records.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const paginatedData = records.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    const summary = {
        totalSubcontractors: total,
        totalToolsInField: records.reduce((acc, r) => acc + (r.holdingCount || 0), 0),
        totalMissingTools: records.reduce((acc, r) => acc + (r.totalMissing || 0), 0),
        averageComplianceRate: total > 0
            ? Math.round(records.reduce((acc, r) => acc + r.returnComplianceRate, 0) / total)
            : 100
    };

    return {
        data: paginatedData,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        summary
    };
};

// ==========================================
// 7. ADMIN LOGIN ACTIVITY REPORT
// ==========================================
export const getLoginReport = async (params = {}) => {
    const {
        page = 1,
        limit = 50,
        search = '',
        role = 'All',
        status = 'All',
        startDate,
        endDate,
        sortBy = 'loginAt',
        sortOrder = 'desc'
    } = params;

    const query = {};

    if (role && role !== 'All') {
        query.role = role;
    }

    if (status && status !== 'All') {
        query.status = status;
    }

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
            { userName: regex },
            { userEmail: regex },
            { parentUserName: regex },
            { approverName: regex },
            { ipAddress: regex }
        ];
    }

    applyDateRange(query, 'loginAt', startDate, endDate);

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [logs, total, successCount, failedCount, pendingCount, rejectedCount] = await Promise.all([
        LoginLog.find(query)
            .populate('user', 'name email user_id role')
            .populate('parentUser', 'name email user_id')
            .populate('approvedBy', 'name email')
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean(),
        LoginLog.countDocuments(query),
        LoginLog.countDocuments({ ...query, status: 'Success' }),
        LoginLog.countDocuments({ ...query, status: 'Failed' }),
        LoginLog.countDocuments({ ...query, status: 'Pending Approval' }),
        LoginLog.countDocuments({ ...query, status: 'Rejected' })
    ]);

    return {
        data: logs,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1
        },
        stats: {
            total,
            success: successCount,
            failed: failedCount,
            pending: pendingCount,
            rejected: rejectedCount
        }
    };
};

// ==========================================
// EXCEL / CSV REPORT EXPORT GENERATOR
// ==========================================
export const generateReportExportBuffer = async (reportType = 'tools', format = 'excel', params = {}, user = null) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'L&T Tool Tracking System';
    workbook.created = new Date();

    const applyExcelStyles = (sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '0F172A' } // Deep L&T Corporate Navy
        };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 28;

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.height = 20;
                row.alignment = { vertical: 'middle' };
                if (rowNumber % 2 === 0) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'F8FAFC' }
                    };
                }
            }
        });
    };

    if (reportType === 'challans') {
        const res = await getChallansReport({ ...params, page: 1, limit: 10000 }, user);
        const sheet = workbook.addWorksheet('Challans Register');

        sheet.columns = [
            { header: 'Challan Number', key: 'challanNumber', width: 22 },
            { header: 'Type', key: 'challanType', width: 14 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Challan Date', key: 'challanDate', width: 18 },
            { header: 'Project', key: 'project', width: 24 },
            { header: 'Source Store', key: 'sourceStore', width: 22 },
            { header: 'Destination / Vendor', key: 'vendor', width: 26 },
            { header: 'Vehicle No', key: 'vehicleNo', width: 16 },
            { header: 'E-Way Bill', key: 'ewayBillNo', width: 18 },
            { header: 'Gate Pass No', key: 'gatePassNo', width: 18 },
            { header: 'Dispatched Tools', key: 'toolCount', width: 16 },
            { header: 'Returned Tools', key: 'returnedCount', width: 16 },
            { header: 'Missing Tools', key: 'missingCount', width: 16 },
            { header: 'Outstanding', key: 'outstandingTools', width: 16 },
            { header: 'Receiver Name', key: 'receiverName', width: 22 }
        ];

        (res.data || []).forEach(r => {
            sheet.addRow({
                challanNumber: r.challanNumber,
                challanType: r.isScrapDC ? 'Scrap DC' : r.challanType,
                status: r.status,
                challanDate: r.challanDate ? new Date(r.challanDate).toLocaleDateString('en-IN') : '-',
                project: r.project?.name || '-',
                sourceStore: r.sourceStore?.name || '-',
                vendor: r.vendor?.name || r.subcontractorName || r.destinationStore?.name || '-',
                vehicleNo: r.vehicleNo || '-',
                ewayBillNo: r.ewayBillNo || '-',
                gatePassNo: r.gatePassNo || '-',
                toolCount: r.toolCount || 0,
                returnedCount: r.returnedCount || 0,
                missingCount: r.missingCount || 0,
                outstandingTools: r.outstandingTools || 0,
                receiverName: r.receiverName || '-'
            });
        });

        applyExcelStyles(sheet);
    } else if (reportType === 'missing') {
        const res = await getMissingToolsReport({ ...params, page: 1, limit: 10000 }, user);
        const sheet = workbook.addWorksheet('Loss & Missing Audit');

        sheet.columns = [
            { header: 'Tool ID', key: 'toolIdStr', width: 20 },
            { header: 'Description', key: 'description', width: 32 },
            { header: 'Tool Code', key: 'toolCode', width: 16 },
            { header: 'Project', key: 'project', width: 24 },
            { header: 'Store', key: 'store', width: 22 },
            { header: 'Responsible Subcontractor', key: 'vendorName', width: 26 },
            { header: 'Originating DC', key: 'dcNumber', width: 20 },
            { header: 'Return RC Reference', key: 'rcNumber', width: 20 },
            { header: 'Date Reported', key: 'missingDate', width: 18 },
            { header: 'Reported By', key: 'reportedBy', width: 20 },
            { header: 'Remarks / Findings', key: 'remarks', width: 30 },
            { header: 'Status', key: 'status', width: 14 }
        ];

        (res.data || []).forEach(r => {
            sheet.addRow({
                toolIdStr: r.toolIdStr,
                description: r.description,
                toolCode: r.toolCode || '-',
                project: r.project?.name || '-',
                store: r.store?.name || '-',
                vendorName: r.vendorName || '-',
                dcNumber: r.dcNumber || '-',
                rcNumber: r.rcNumber || '-',
                missingDate: r.missingDate ? new Date(r.missingDate).toLocaleDateString('en-IN') : '-',
                reportedBy: r.reportedBy || '-',
                remarks: r.remarks || '-',
                status: r.status
            });
        });

        applyExcelStyles(sheet);
    } else if (reportType === 'inspections') {
        const res = await getInspectionsReport({ ...params, page: 1, limit: 10000 }, user);
        const sheet = workbook.addWorksheet('Inspection & Compliance');

        sheet.columns = [
            { header: 'Tool ID', key: 'toolId', width: 20 },
            { header: 'Description', key: 'description', width: 32 },
            { header: 'Category', key: 'toolType', width: 18 },
            { header: 'Project', key: 'project', width: 24 },
            { header: 'Current Store', key: 'currentSite', width: 22 },
            { header: 'Equipment Age', key: 'toolAgeYears', width: 16 },
            { header: 'Last Inspection', key: 'lastInspectionDate', width: 18 },
            { header: 'Next Due Date', key: 'nextInspectionDueDate', width: 18 },
            { header: 'Compliance', key: 'complianceBadge', width: 16 },
            { header: 'Result', key: 'inspectionResult', width: 14 },
            { header: 'Action', key: 'inspectionAction', width: 14 },
            { header: 'Inspected By', key: 'inspectedBy', width: 20 },
            { header: 'Life Extension (Yrs)', key: 'lifeExtensionYears', width: 20 },
            { header: 'Extension Approved By', key: 'extensionApprovedBy', width: 24 }
        ];

        (res.data || []).forEach(r => {
            sheet.addRow({
                toolId: r.toolId,
                description: r.description,
                toolType: r.toolType || r.toolVariant || 'General',
                project: r.project?.name || '-',
                currentSite: r.currentSite?.name || '-',
                toolAgeYears: `${r.toolAgeYears || 0} Yrs`,
                lastInspectionDate: r.lastInspectionDate ? new Date(r.lastInspectionDate).toLocaleDateString('en-IN') : '-',
                nextInspectionDueDate: r.nextInspectionDueDate ? new Date(r.nextInspectionDueDate).toLocaleDateString('en-IN') : '-',
                complianceBadge: r.complianceBadge || 'Valid',
                inspectionResult: r.inspectionResult || 'Pending',
                inspectionAction: r.inspectionAction || '-',
                inspectedBy: r.inspectedBy?.name || '-',
                lifeExtensionYears: r.lifeExtensionYears ? `${r.lifeExtensionYears} Year(s)` : 'None',
                extensionApprovedBy: r.extensionApprovedBy || '-'
            });
        });

        applyExcelStyles(sheet);
    } else if (reportType === 'scrap') {
        const res = await getScrapReport({ ...params, page: 1, limit: 10000 }, user);
        const sheet = workbook.addWorksheet('Scrap & Disposal Register');

        sheet.columns = [
            { header: 'Tool ID', key: 'toolId', width: 20 },
            { header: 'Description', key: 'description', width: 32 },
            { header: 'Category', key: 'toolType', width: 18 },
            { header: 'Project', key: 'project', width: 24 },
            { header: 'Origin Store', key: 'currentSite', width: 22 },
            { header: 'Scrapped Date', key: 'scrappedAt', width: 18 },
            { header: 'Scrapped By', key: 'scrappedBy', width: 20 },
            { header: 'Scrap Reason', key: 'scrapReason', width: 28 },
            { header: 'Disposal Status', key: 'disposalStatus', width: 18 },
            { header: 'Authorized Scrap Dealer', key: 'scrapDealer', width: 26 },
            { header: 'Disposal SDC No', key: 'disposalChallanNumber', width: 22 },
            { header: 'Disposal Date', key: 'disposedAt', width: 18 }
        ];

        (res.data || []).forEach(r => {
            sheet.addRow({
                toolId: r.toolId,
                description: r.description,
                toolType: r.toolType || r.toolVariant || 'General',
                project: r.project?.name || '-',
                currentSite: r.currentSite?.name || '-',
                scrappedAt: r.scrappedAt ? new Date(r.scrappedAt).toLocaleDateString('en-IN') : '-',
                scrappedBy: r.scrappedBy?.name || '-',
                scrapReason: r.scrapReason || '-',
                disposalStatus: r.isDisposed ? 'Disposed' : 'Pending Disposal',
                scrapDealer: r.scrapDealer?.name || '-',
                disposalChallanNumber: r.disposalChallanNumber || '-',
                disposedAt: r.disposedAt ? new Date(r.disposedAt).toLocaleDateString('en-IN') : '-'
            });
        });

        applyExcelStyles(sheet);
    } else if (reportType === 'subcontractors') {
        const res = await getSubcontractorsReport({ ...params, page: 1, limit: 10000 });
        const sheet = workbook.addWorksheet('Subcontractor Custody Ledger');

        sheet.columns = [
            { header: 'Subcontractor / Vendor Name', key: 'name', width: 28 },
            { header: 'Code', key: 'code', width: 16 },
            { header: 'Contact Person', key: 'contactPerson', width: 22 },
            { header: 'Phone', key: 'contactPhone', width: 18 },
            { header: 'Email', key: 'contactEmail', width: 24 },
            { header: 'DCs Issued', key: 'dcCount', width: 14 },
            { header: 'RCs Processed', key: 'rcCount', width: 16 },
            { header: 'Tools Dispatched', key: 'totalDispatched', width: 18 },
            { header: 'Tools Returned', key: 'totalReturned', width: 16 },
            { header: 'Tools Missing / Lost', key: 'totalMissing', width: 20 },
            { header: 'Active in Field (Holding)', key: 'holdingCount', width: 24 },
            { header: 'Return Compliance Rate', key: 'returnComplianceRate', width: 24 }
        ];

        (res.data || []).forEach(r => {
            sheet.addRow({
                name: r.name,
                code: r.code,
                contactPerson: r.contactPerson,
                contactPhone: r.contactPhone,
                contactEmail: r.contactEmail,
                dcCount: r.dcCount,
                rcCount: r.rcCount,
                totalDispatched: r.totalDispatched,
                totalReturned: r.totalReturned,
                totalMissing: r.totalMissing,
                holdingCount: r.holdingCount,
                returnComplianceRate: `${r.returnComplianceRate}%`
            });
        });

        applyExcelStyles(sheet);
    } else if (reportType === 'logins') {
        return await generateLoginReportExportBuffer(format, params);
    } else {
        // Default: Tools Inventory Report
        const res = await getToolsReport({ ...params, page: 1, limit: 10000 }, user);
        const sheet = workbook.addWorksheet('Tools Master Register');

        sheet.columns = [
            { header: 'Tool ID', key: 'toolId', width: 20 },
            { header: 'Description', key: 'description', width: 34 },
            { header: 'Tool Code', key: 'toolCode', width: 16 },
            { header: 'Category', key: 'toolType', width: 18 },
            { header: 'Project', key: 'project', width: 24 },
            { header: 'Current Store', key: 'currentSite', width: 22 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Current Subcontractor', key: 'subcontractorName', width: 26 },
            { header: 'SWL / Capacity', key: 'capacity', width: 18 },
            { header: 'Make Year', key: 'makeYear', width: 14 },
            { header: 'Inspection Status', key: 'inspectionStatus', width: 18 },
            { header: 'Next Inspection Due', key: 'nextInspectionDueDate', width: 20 },
            { header: 'QR Printed', key: 'isPrinted', width: 14 }
        ];

        (res.data || []).forEach(r => {
            sheet.addRow({
                toolId: r.toolId,
                description: r.description,
                toolCode: r.toolCode || '-',
                toolType: r.toolType || r.toolVariant || 'General',
                project: r.project?.name || 'Unassigned',
                currentSite: r.currentSite?.name || 'Central Store',
                status: r.isScrapped
                    ? 'Scrapped'
                    : (typeof r.status === 'string' && r.status.toLowerCase().includes('repair'))
                    ? 'Under Repair'
                    : (r.status || 'Available'),
                subcontractorName: r.subcontractorName || '-',
                capacity: r.safeWorkingLoad || r.capacity || '-',
                makeYear: r.makeYear || '-',
                inspectionStatus: r.inspectionStatus || 'Pending',
                nextInspectionDueDate: r.nextInspectionDueDate ? new Date(r.nextInspectionDueDate).toLocaleDateString('en-IN') : '-',
                isPrinted: r.isPrinted ? 'Yes' : 'No'
            });
        });

        applyExcelStyles(sheet);
    }

    if (format === 'csv') {
        return await workbook.csv.writeBuffer();
    }
    return await workbook.xlsx.writeBuffer();
};

export const generateLoginReportExportBuffer = async (format = 'excel', params = {}) => {
    const {
        search = '',
        role = 'All',
        status = 'All',
        startDate,
        endDate,
        sortBy = 'loginAt',
        sortOrder = 'desc'
    } = params;

    const query = {};
    if (role && role !== 'All') query.role = role;
    if (status && status !== 'All') query.status = status;
    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
            { userName: regex },
            { userEmail: regex },
            { parentUserName: regex },
            { approverName: regex }
        ];
    }
    applyDateRange(query, 'loginAt', startDate, endDate);

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const logs = await LoginLog.find(query)
        .populate('user', 'name email user_id role')
        .populate('parentUser', 'name email user_id')
        .populate('approvedBy', 'name email')
        .sort(sortOptions)
        .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'L&T Tool Tracking System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Login Activity Report');

    sheet.columns = [
        { header: 'User Name', key: 'userName', width: 24 },
        { header: 'Email Address', key: 'userEmail', width: 28 },
        { header: 'Role', key: 'role', width: 14 },
        { header: 'Parent User', key: 'parentUser', width: 24 },
        { header: 'Login Date & Time', key: 'loginAt', width: 22 },
        { header: 'Login Status', key: 'status', width: 18 },
        { header: 'Authorized By', key: 'approvedBy', width: 24 },
        { header: 'Action Timestamp', key: 'approvedAt', width: 22 },
        { header: 'Rejection Reason', key: 'rejectionReason', width: 30 },
        { header: 'Logout Time', key: 'logoutAt', width: 22 },
        { header: 'Session Duration', key: 'sessionDuration', width: 18 },
        { header: 'Device & Browser', key: 'deviceInfo', width: 26 },
        { header: 'IP Address', key: 'ipAddress', width: 18 }
    ];

    const formatDuration = (seconds) => {
        if (!seconds && seconds !== 0) return '-';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins === 0) return `${secs}s`;
        return `${mins}m ${secs}s`;
    };

    logs.forEach(log => {
        sheet.addRow({
            userName: log.userName || log.user?.name || 'N/A',
            userEmail: log.userEmail || log.user?.email || 'N/A',
            role: log.role || log.user?.role || 'User',
            parentUser: log.parentUserName || log.parentUser?.name || (log.role === 'Subuser' ? 'Unassigned' : '-'),
            loginAt: log.loginAt ? new Date(log.loginAt).toLocaleString('en-IN') : '-',
            status: log.status,
            approvedBy: log.approverName || log.approvedBy?.name || '-',
            approvedAt: log.approvedAt ? new Date(log.approvedAt).toLocaleString('en-IN') : '-',
            rejectionReason: log.rejectionReason || '-',
            logoutAt: log.logoutAt ? new Date(log.logoutAt).toLocaleString('en-IN') : '-',
            sessionDuration: formatDuration(log.sessionDuration),
            deviceInfo: log.deviceInfo || log.userAgent || 'Unknown Device',
            ipAddress: log.ipAddress || '-'
        });
    });

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0F172A' }
    };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 28;

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            row.height = 20;
            if (rowNumber % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8FAFC' }
                };
            }
        }
    });

    if (format === 'csv') {
        return await workbook.csv.writeBuffer();
    }
    return await workbook.xlsx.writeBuffer();
};
