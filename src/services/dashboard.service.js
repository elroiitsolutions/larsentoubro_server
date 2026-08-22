import mongoose from 'mongoose';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';
import { ToolMovement } from '../models/toolMovement.model.js';
import ToolAuditLog from '../models/toolAuditLog.model.js';

export const getDashboardStats = async (filters = {}) => {
    const {
        division,
        project: projectId,
        store: storeId,
        hub: hubId,
        category,
        status,
        startDate,
        endDate
    } = filters;

    // Build Tool query
    const query = {};

    if (division && division !== 'All') {
        query.division = division;
    }

    if (projectId && projectId !== 'All' && mongoose.Types.ObjectId.isValid(projectId)) {
        query.project = new mongoose.Types.ObjectId(projectId);
    }

    if (storeId && storeId !== 'All' && mongoose.Types.ObjectId.isValid(storeId)) {
        query.currentSite = new mongoose.Types.ObjectId(storeId);
    }

    if (hubId && hubId !== 'All' && mongoose.Types.ObjectId.isValid(hubId)) {
        query.hub = new mongoose.Types.ObjectId(hubId);
    }

    if (category && category !== 'All') {
        query.toolType = { $regex: `^${category}$`, $options: 'i' };
    }

    if (status && status !== 'All') {
        query.status = { $regex: `^${status}$`, $options: 'i' };
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // 1. Fetch all dashboard data concurrently in parallel
    const [tools, movements, allProjects, allStores, auditLogs] = await Promise.all([
        Tool.find(query)
            .populate('project', 'name projectCode division')
            .populate('currentSite', 'name location type division')
            .populate('hub', 'name location')
            .lean(),
        ToolMovement.find().sort({ date: -1 }).limit(50).lean(),
        Project.find().lean(),
        Store.find().populate('project').lean(),
        ToolAuditLog.find().sort({ timestamp: -1 }).limit(20).lean()
    ]);

    const now = new Date();
    const norm = (s) => (s || '').toLowerCase().trim();

    let totalTools = tools.length;
    let available = 0;
    let issued = 0;
    let underInspection = 0;
    let inspectionDue = 0;
    let expired = 0;
    let damagedRepair = 0;
    let scrap = 0;
    let missing = 0;
    let inTransit = 0;
    let usable = 0;
    let unusable = 0;

    let under1Year = 0;
    let yr1To2 = 0;
    let yr2To3 = 0;
    let over3YrPendingInspection = 0;
    let extended1Yr = 0;
    let extended2Yr = 0;

    const alerts = [];

    tools.forEach(tool => {
        const st = norm(tool.status);
        const supplyDate = tool.manufactureDate || (tool.dateOfSupply ? new Date(tool.dateOfSupply) : null) || tool.createdAt;
        const toolAgeMs = supplyDate ? (now.getTime() - new Date(supplyDate).getTime()) : 0;
        const toolAgeYears = toolAgeMs / (365.25 * 24 * 60 * 60 * 1000);

        const isOver3Years = toolAgeYears >= 3;
        const isInspectionDue = st === 'inspection due' || (isOver3Years && (!tool.lifeExtensionYears || tool.lifeExtensionYears === 0) && st !== 'scrap');
        const isExpired = st === 'expired' || (tool.nextInspectionDueDate && new Date(tool.nextInspectionDueDate) < now && st !== 'scrap');

        if (st === 'available') available++;
        else if (st === 'issued') issued++;
        else if (st === 'under inspection' || st === 'inspection') underInspection++;
        else if (isInspectionDue) inspectionDue++;
        else if (isExpired) expired++;
        else if (st.includes('repair') || st.includes('damaged') || st === 'damaged/repair') damagedRepair++;
        else if (st === 'scrap') scrap++;
        else if (st === 'missing') missing++;
        else if (st === 'in transit' || st === 'transit') inTransit++;
        else available++;

        if (['available', 'issued', 'in transit', 'transit', 'under inspection'].includes(st)) {
            usable++;
        } else if (['damaged/repair', 'repair', 'damaged', 'scrap', 'expired', 'unusable'].includes(st) || isExpired) {
            unusable++;
        } else {
            usable++;
        }

        if (tool.lifeExtensionYears === 1) {
            extended1Yr++;
        } else if (tool.lifeExtensionYears === 2) {
            extended2Yr++;
        } else if (toolAgeYears < 1) {
            under1Year++;
        } else if (toolAgeYears < 2) {
            yr1To2++;
        } else if (toolAgeYears < 3) {
            yr2To3++;
        } else {
            over3YrPendingInspection++;
        }

        if (isInspectionDue) {
            alerts.push({
                id: `alert-insp-${tool._id}`,
                type: 'Inspection Due',
                severity: 'warning',
                title: `Inspection Required (3+ Yrs)`,
                message: `Tool ${tool.toolId || tool.description} has reached 3-year lifespan and requires manual inspection.`,
                toolId: tool.toolId,
                toolDbId: tool._id,
                date: new Date()
            });
        }
        if (isExpired) {
            alerts.push({
                id: `alert-exp-${tool._id}`,
                type: 'Expired Tool',
                severity: 'danger',
                title: `Validity Expired`,
                message: `Tool ${tool.toolId || tool.description} validity period has expired.`,
                toolId: tool.toolId,
                toolDbId: tool._id,
                date: new Date()
            });
        }
        if (st === 'missing') {
            alerts.push({
                id: `alert-miss-${tool._id}`,
                type: 'Missing Tool',
                severity: 'danger',
                title: `Tool Reported Missing`,
                message: `Tool ${tool.toolId || tool.description} is flagged as missing.`,
                toolId: tool.toolId,
                toolDbId: tool._id,
                date: new Date()
            });
        }
        if (st.includes('repair') || st.includes('damaged')) {
            alerts.push({
                id: `alert-rep-${tool._id}`,
                type: 'Damaged / Under Repair',
                severity: 'warning',
                title: `Tool Under Repair`,
                message: `Tool ${tool.toolId || tool.description} is undergoing repair.`,
                toolId: tool.toolId,
                toolDbId: tool._id,
                date: new Date()
            });
        }
    });

    // 2. Process Movements
    let movementsIn = 0;
    let movementsOut = 0;
    let transfers = 0;
    let pendingInward = 0;

    movements.forEach(m => {
        if (m.movementType === 'Delivery') movementsOut++;
        else if (m.movementType === 'Return') movementsIn++;
        else transfers++;

        if (m.remarks && m.remarks.toLowerCase().includes('pending')) {
            pendingInward++;
        }
    });

    // 3. Process Location Hierarchy
    const divisionMap = {};
    const defaultDivisions = [
        'Buildings & Infrastructure',
        'Heavy Civil Infrastructure',
        'Power Transmission & Distribution',
        'Water & Effluent Treatment',
        'Transportation Infrastructure'
    ];

    defaultDivisions.forEach(divName => {
        divisionMap[divName] = {
            id: `div-${divName.replace(/[^a-zA-Z0-9]/g, '-')}`,
            name: divName,
            type: 'Division',
            totalTools: 0,
            available: 0,
            issued: 0,
            alertsCount: 0,
            projects: []
        };
    });

    allProjects.forEach(proj => {
        const divName = proj.division || 'Buildings & Infrastructure';
        if (!divisionMap[divName]) {
            divisionMap[divName] = {
                id: `div-${divName.replace(/[^a-zA-Z0-9]/g, '-')}`,
                name: divName,
                type: 'Division',
                totalTools: 0,
                available: 0,
                issued: 0,
                alertsCount: 0,
                projects: []
            };
        }

        const projStores = allStores.filter(s => s.project && (s.project._id || s.project).toString() === proj._id.toString());
        const storesList = projStores.map(st => {
            const storeTools = tools.filter(t => t.currentSite && (t.currentSite._id || t.currentSite).toString() === st._id.toString());
            const stAvailable = storeTools.filter(t => norm(t.status) === 'available').length;
            const stIssued = storeTools.filter(t => norm(t.status) === 'issued').length;
            const stAlerts = storeTools.filter(t => ['missing', 'inspection due', 'expired', 'damaged/repair'].includes(norm(t.status))).length;

            return {
                id: st._id.toString(),
                name: st.name,
                type: st.type || 'Store',
                location: st.location,
                totalTools: storeTools.length,
                available: stAvailable,
                issued: stIssued,
                alertsCount: stAlerts
            };
        });

        const projTools = tools.filter(t => t.project && (t.project._id || t.project).toString() === proj._id.toString());
        const prAvailable = projTools.filter(t => norm(t.status) === 'available').length;
        const prIssued = projTools.filter(t => norm(t.status) === 'issued').length;
        const prAlerts = projTools.filter(t => ['missing', 'inspection due', 'expired', 'damaged/repair'].includes(norm(t.status))).length;

        divisionMap[divName].projects.push({
            id: proj._id.toString(),
            name: proj.name,
            projectCode: proj.projectCode || 'P-CODE',
            type: 'Project',
            totalTools: projTools.length,
            available: prAvailable,
            issued: prIssued,
            alertsCount: prAlerts,
            stores: storesList
        });
    });

    Object.values(divisionMap).forEach(div => {
        let divTotal = 0;
        let divAvailable = 0;
        let divIssued = 0;
        let divAlerts = 0;

        div.projects.forEach(p => {
            divTotal += p.totalTools;
            divAvailable += p.available;
            divIssued += p.issued;
            divAlerts += p.alertsCount;
        });

        div.totalTools = divTotal;
        div.available = divAvailable;
        div.issued = divIssued;
        div.alertsCount = divAlerts;
    });

    const hierarchyTree = Object.values(divisionMap);

    // 4. Status Overview
    const statusDistribution = [
        { status: 'Available', count: available, color: '#10b981' },
        { status: 'Issued', count: issued, color: '#3b82f6' },
        { status: 'Under Inspection', count: underInspection, color: '#8b5cf6' },
        { status: 'Inspection Due', count: inspectionDue, color: '#f59e0b' },
        { status: 'Expired', count: expired, color: '#ef4444' },
        { status: 'Damaged / Repair', count: damagedRepair, color: '#f97316' },
        { status: 'Scrap', count: scrap, color: '#64748b' },
        { status: 'Missing', count: missing, color: '#dc2626' },
        { status: 'In Transit', count: inTransit, color: '#06b6d4' }
    ];

    // 5. Activity Feed
    const formatUser = (u) => {
        if (!u) return 'Store Manager';
        if (typeof u === 'string') return u;
        if (typeof u === 'object') return u.name || u.user_id || u.email || 'Store Manager';
        return String(u);
    };

    const activityFeed = [];

    movements.forEach(m => {
        activityFeed.push({
            id: `mov-${m._id}`,
            action: m.movementType === 'Delivery' ? 'Tool Issued' : m.movementType === 'Return' ? 'Tool Returned' : 'Tool Transferred',
            toolId: m.toolIdStr || 'Tool',
            user: formatUser(m.user),
            details: `From: ${m.from} → To: ${m.to} (Ref: ${m.referenceNumber})`,
            date: m.date || m.createdAt,
            type: m.movementType
        });
    });

    auditLogs.forEach(log => {
        activityFeed.push({
            id: `audit-${log._id}`,
            action: log.action || 'Tool Updated',
            toolId: log.toolId || 'System Tool',
            user: formatUser(log.user),
            details: log.details || 'Tool parameters updated',
            date: log.timestamp || log.createdAt,
            type: 'Audit'
        });
    });

    activityFeed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
        summaryCards: {
            totalTools,
            available,
            issued,
            underInspection,
            inspectionDue,
            expired,
            damagedRepair,
            scrap,
            usable,
            unusable,
            missing,
            inTransit
        },
        hierarchyTree,
        statusDistribution,
        toolLifeAge: {
            under1Year,
            yr1To2,
            yr2To3,
            over3YrPendingInspection,
            extended1Yr,
            extended2Yr,
            totalExceeding3Yrs: over3YrPendingInspection + extended1Yr + extended2Yr
        },
        toolMovement: {
            movementsIn,
            movementsOut,
            transfers,
            pendingInward,
            currentlyInTransit: inTransit
        },
        alerts: alerts.slice(0, 15),
        recentActivity: activityFeed.slice(0, 15)
    };
};

export const extendToolLife = async (toolId, payload = {}) => {
    const { extensionYears = 1, inspectorName = 'Inspector', remarks = '' } = payload;
    
    let tool = null;
    if (mongoose.Types.ObjectId.isValid(toolId)) {
        tool = await Tool.findById(toolId);
    }
    if (!tool) {
        tool = await Tool.findOne({ toolId: toolId });
    }
    if (!tool) {
        throw new Error('Tool not found');
    }

    const extensionNum = parseInt(extensionYears, 10) || 1;
    const currentDate = new Date();
    const nextDueDate = new Date(currentDate.getTime() + extensionNum * 365.25 * 24 * 60 * 60 * 1000);

    tool.lifeExtensionYears = (tool.lifeExtensionYears || 0) + extensionNum;
    tool.lastInspectionDate = currentDate;
    tool.nextInspectionDueDate = nextDueDate;
    tool.inspectionStatus = 'Passed';
    tool.extensionApprovedBy = inspectorName;
    tool.extensionApprovedAt = currentDate;
    tool.status = 'Available';
    if (remarks) {
        tool.remarks = `${tool.remarks || ''}\n[${currentDate.toISOString().split('T')[0]}] Extended +${extensionNum} yr by ${inspectorName}: ${remarks}`;
    }

    await tool.save();

    await ToolAuditLog.create({
        tool: tool._id,
        toolId: tool.toolId,
        action: `Life Extended (+${extensionNum} Yr)`,
        user: inspectorName,
        details: `Validity extended by ${extensionNum} year(s). Remarks: ${remarks}`
    });

    return tool;
};

export default {
    getDashboardStats,
    extendToolLife
};
