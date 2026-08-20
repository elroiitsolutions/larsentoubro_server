import mongoose from 'mongoose';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';
import { ToolMovement } from '../models/toolMovement.model.js';
import ToolAuditLog from '../models/toolAuditLog.model.js';

export const seedDashboardData = async () => {
    try {
        console.log('[Seed] Seeding realistic dashboard sample data...');

        // 1. Ensure Projects
        const projectsData = [
            { name: 'Mumbai Metro Line 3', projectCode: 'MM-L3-2026', division: 'Buildings & Infrastructure', department: 'Civil' },
            { name: 'Bullet Train Package C4', projectCode: 'MAHSR-C4', division: 'Heavy Civil Infrastructure', department: 'Infrastructure' },
            { name: 'Substation Expansion Project', projectCode: 'PTD-SUB-09', division: 'Power Transmission & Distribution', department: 'Electrical' },
            { name: 'Water Treatment Plant Ph-2', projectCode: 'WET-WTP-02', division: 'Water & Effluent Treatment', department: 'Hydraulic' },
            { name: 'Expressway Flyover Package 2', projectCode: 'TI-EXP-02', division: 'Transportation Infrastructure', department: 'Highways' }
        ];

        const createdProjects = [];
        for (const pData of projectsData) {
            let proj = await Project.findOne({ projectCode: pData.projectCode });
            if (!proj) {
                proj = await Project.create(pData);
            } else {
                proj.division = pData.division;
                await proj.save();
            }
            createdProjects.push(proj);
        }

        // 2. Ensure Stores & HUBs
        const storesData = [
            { name: 'Central Site Store 01', location: 'Bandra Depot, Mumbai', type: 'Store', project: createdProjects[0]._id, division: 'Buildings & Infrastructure' },
            { name: 'Regional Equipment HUB West', location: 'Thane HUB Yard', type: 'HUB', project: createdProjects[0]._id, division: 'Buildings & Infrastructure' },
            { name: 'Heavy Machinery Yard 02', location: 'Vapi Site, Gujarat', type: 'Store', project: createdProjects[1]._id, division: 'Heavy Civil Infrastructure' },
            { name: 'North Logistics HUB', location: 'Surat Central HUB', type: 'HUB', project: createdProjects[1]._id, division: 'Heavy Civil Infrastructure' },
            { name: 'Substation Site Store', location: 'Pune Sector 4', type: 'Store', project: createdProjects[2]._id, division: 'Power Transmission & Distribution' }
        ];

        const createdStores = [];
        for (const sData of storesData) {
            let store = await Store.findOne({ name: sData.name });
            if (!store) {
                store = await Store.create(sData);
            } else {
                store.type = sData.type;
                store.division = sData.division;
                await store.save();
            }
            createdStores.push(store);
        }

        // 3. Ensure Tools across all 12 statuses & 3-year age variations
        const count = await Tool.countDocuments();
        if (count < 15) {
            const now = new Date();
            const fourYearsAgo = new Date(now.getTime() - 4 * 365.25 * 24 * 60 * 60 * 1000);
            const twoYearsAgo = new Date(now.getTime() - 2 * 365.25 * 24 * 60 * 60 * 1000);
            const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

            const sampleTools = [
                {
                    description: 'Heavy Torque Wrench 500Nm',
                    toolCode: 'TW-500-A',
                    toolType: 'Hand Tools',
                    status: 'Available',
                    division: 'Buildings & Infrastructure',
                    project: createdProjects[0]._id,
                    currentSite: createdStores[0]._id,
                    hub: createdStores[1]._id,
                    manufactureDate: sixMonthsAgo,
                    dateOfSupply: '2026-02-10'
                },
                {
                    description: 'Hydraulic Jack 50T Heavy Lift',
                    toolCode: 'HJ-050-B',
                    toolType: 'Heavy Equipment',
                    status: 'Issued',
                    division: 'Buildings & Infrastructure',
                    project: createdProjects[0]._id,
                    currentSite: createdStores[0]._id,
                    hub: createdStores[1]._id,
                    manufactureDate: twoYearsAgo,
                    dateOfSupply: '2024-06-15'
                },
                {
                    description: 'Digital Laser Distance Meter 200m',
                    toolCode: 'LDM-200',
                    toolType: 'Testing Equipment',
                    status: 'Inspection Due',
                    division: 'Heavy Civil Infrastructure',
                    project: createdProjects[1]._id,
                    currentSite: createdStores[2]._id,
                    hub: createdStores[3]._id,
                    manufactureDate: fourYearsAgo,
                    dateOfSupply: '2022-01-10',
                    lifeExtensionYears: 0
                },
                {
                    description: 'Concrete Core Drilling Rig 150mm',
                    toolCode: 'CDR-150-C',
                    toolType: 'Power Tools',
                    status: 'Under Inspection',
                    division: 'Heavy Civil Infrastructure',
                    project: createdProjects[1]._id,
                    currentSite: createdStores[2]._id,
                    hub: createdStores[3]._id,
                    manufactureDate: fourYearsAgo,
                    dateOfSupply: '2022-03-20',
                    lifeExtensionYears: 1,
                    lastInspectionDate: sixMonthsAgo
                },
                {
                    description: 'High Pressure Grouting Pump',
                    toolCode: 'HPG-900',
                    toolType: 'Power Tools',
                    status: 'Damaged/Repair',
                    division: 'Power Transmission & Distribution',
                    project: createdProjects[2]._id,
                    currentSite: createdStores[4]._id,
                    manufactureDate: twoYearsAgo,
                    dateOfSupply: '2024-08-01'
                },
                {
                    description: 'Pneumatic Breaker 30kg',
                    toolCode: 'PB-030-X',
                    toolType: 'Power Tools',
                    status: 'Scrap',
                    division: 'Buildings & Infrastructure',
                    project: createdProjects[0]._id,
                    currentSite: createdStores[0]._id,
                    manufactureDate: fourYearsAgo,
                    dateOfSupply: '2021-05-10'
                },
                {
                    description: 'Optical Transit Surveying Station',
                    toolCode: 'OTS-800',
                    toolType: 'Testing Equipment',
                    status: 'Missing',
                    division: 'Transportation Infrastructure',
                    project: createdProjects[4]._id,
                    currentSite: createdStores[0]._id,
                    manufactureDate: twoYearsAgo,
                    dateOfSupply: '2024-03-12'
                },
                {
                    description: 'Diesel Generator 100kVA Mobile Unit',
                    toolCode: 'DG-100-M',
                    toolType: 'Heavy Equipment',
                    status: 'In Transit',
                    division: 'Heavy Civil Infrastructure',
                    project: createdProjects[1]._id,
                    currentSite: createdStores[2]._id,
                    hub: createdStores[3]._id,
                    manufactureDate: sixMonthsAgo,
                    dateOfSupply: '2026-01-05'
                },
                {
                    description: 'Safety Harness Double Lanyard Kit',
                    toolCode: 'SH-DL-99',
                    toolType: 'Safety Gear',
                    status: 'Expired',
                    division: 'Buildings & Infrastructure',
                    project: createdProjects[0]._id,
                    currentSite: createdStores[0]._id,
                    manufactureDate: fourYearsAgo,
                    dateOfSupply: '2022-02-01',
                    nextInspectionDueDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
                }
            ];

            for (const tData of sampleTools) {
                await Tool.create(tData);
            }
            console.log('[Seed] Created sample tools!');
        }

        // 4. Ensure Sample Movements
        const movCount = await ToolMovement.countDocuments();
        if (movCount < 5) {
            await ToolMovement.create([
                {
                    tool: (await Tool.findOne())._id,
                    toolIdStr: 'T-001',
                    movementType: 'Delivery',
                    from: 'Central Site Store 01',
                    to: 'Subcontractor Site Alpha',
                    referenceNumber: 'DC-2026-000101',
                    date: new Date(),
                    user: 'Store Manager V. Patil',
                    remarks: 'Issued for foundation casting'
                },
                {
                    tool: (await Tool.findOne())._id,
                    toolIdStr: 'T-002',
                    movementType: 'Return',
                    from: 'Subcontractor Site Alpha',
                    to: 'Regional Equipment HUB West',
                    referenceNumber: 'RC-2026-000088',
                    date: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    user: 'QA Engineer A. Kumar',
                    remarks: 'Returned after job completion'
                }
            ]);
        }

        console.log('[Seed] Dashboard sample data ready!');
    } catch (err) {
        console.error('[Seed] Dashboard seeding error:', err);
    }
};

export default seedDashboardData;
