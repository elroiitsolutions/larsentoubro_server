import { Profile } from '../models/profile.model.js';
import { Vendor } from '../models/vendor.model.js';
import { FormDefinition } from '../models/formDefinition.model.js';

export const migrateProfilesAndForms = async () => {
    try {
        console.log('[Migration] Checking Profile migration and Form definitions...');

        // 1. Migrate existing Vendor documents to Profile collection (Subcontractor profileType)
        const existingVendors = await Vendor.find({}).lean();
        let migratedCount = 0;

        for (const v of existingVendors) {
            const existingProfile = await Profile.findById(v._id);
            if (!existingProfile) {
                const code = v.vendorCode ? v.vendorCode.trim().toUpperCase() : `SUB-${v._id.toString().substring(0, 6).toUpperCase()}`;
                await Profile.create({
                    _id: v._id,
                    profileType: 'Subcontractor',
                    name: v.name || 'Unnamed Subcontractor',
                    code: code,
                    contactPerson: v.contactPerson || '',
                    contactDesignation: v.contactDesignation || '',
                    contactPhone: v.contactPhone || '',
                    alternatePhone: v.alternatePhone || '',
                    contactEmail: v.contactEmail || '',
                    address: v.address || '',
                    gstNumber: v.gstNumber || '',
                    status: v.status || 'Active',
                    projects: v.projects || [],
                    stores: v.stores || [],
                    metrics: v.metrics || { dcCount: 0, rcCount: 0, returnedCount: 0, missingCount: 0 }
                });
                migratedCount++;
            }
        }

        if (migratedCount > 0) {
            console.log(`[Migration] Successfully migrated ${migratedCount} legacy vendors to Profile collection.`);
        }

        // 2. Ensure Form Definitions exist for each profile type independently
        const defaultForms = [
            {
                name: 'Subcontractor (Vendor) Form',
                slug: 'subcontractor-form',
                description: 'Configure customizable input fields, contact details, GST validation, and requirements for Subcontractor / Vendor profiles.',
                isActive: true,
                fields: [
                    { id: 'name', name: 'name', label: 'Subcontractor / Vendor Name', type: 'text', placeholder: 'e.g. RADHE SWAMI CONSTRUCTION', validations: [{ type: 'required', message: 'Name is required' }], order: 0 },
                    { id: 'code', name: 'code', label: 'Subcontractor Code', type: 'text', placeholder: 'e.g. SUB-0001', validations: [{ type: 'required', message: 'Code is required' }], order: 1 },
                    { id: 'contactPerson', name: 'contactPerson', label: 'Manager / Contact Person', type: 'text', placeholder: 'e.g. Dinesh G', order: 2 },
                    { id: 'contactDesignation', name: 'contactDesignation', label: 'Contact Designation', type: 'text', placeholder: 'e.g. Site Manager', order: 3 },
                    { id: 'contactEmail', name: 'contactEmail', label: 'Contact Email Address', type: 'email', placeholder: 'e.g. contact@subcontractor.com', order: 4 },
                    { id: 'contactPhone', name: 'contactPhone', label: 'Primary Phone Number', type: 'text', placeholder: 'e.g. 9934110587', validations: [{ type: 'required', message: 'Primary phone is required' }], order: 5 },
                    { id: 'alternatePhone', name: 'alternatePhone', label: 'Alternate Phone Number', type: 'text', placeholder: 'e.g. 9876543210', order: 6 },
                    { id: 'address', name: 'address', label: 'Registered Office / Site Address', type: 'textarea', placeholder: 'Enter registered address', order: 7 },
                    { id: 'gstNumber', name: 'gstNumber', label: 'GST / Tax Identification Number', type: 'text', placeholder: 'e.g. 27AAACL0140P1Z0', order: 8 },
                    { id: 'panNumber', name: 'panNumber', label: 'PAN Number', type: 'text', placeholder: 'e.g. ABCDE1234F', order: 9 },
                    { id: 'status', name: 'status', label: 'Profile Status', type: 'select', options: [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }], order: 10 }
                ]
            },
            {
                name: 'Scrap Dealer Form',
                slug: 'scrap-dealer-form',
                description: 'Configure customizable input fields, contact details, GST, PAN, and Scrap License details for Scrap Dealer profiles.',
                isActive: true,
                fields: [
                    { id: 'name', name: 'name', label: 'Scrap Dealer / Firm Name', type: 'text', placeholder: 'e.g. SHREE METALS SCRAP DEALERS', validations: [{ type: 'required', message: 'Firm name is required' }], order: 0 },
                    { id: 'code', name: 'code', label: 'Scrap Dealer Code', type: 'text', placeholder: 'e.g. SCR-0001', validations: [{ type: 'required', message: 'Code is required' }], order: 1 },
                    { id: 'contactPerson', name: 'contactPerson', label: 'Proprietor / Contact Person', type: 'text', placeholder: 'e.g. Ramesh Patel', order: 2 },
                    { id: 'contactEmail', name: 'contactEmail', label: 'Contact Email Address', type: 'email', placeholder: 'e.g. ramesh@shreemetals.com', order: 3 },
                    { id: 'contactPhone', name: 'contactPhone', label: 'Primary Phone Number', type: 'text', placeholder: 'e.g. 9820012345', validations: [{ type: 'required', message: 'Phone number is required' }], order: 4 },
                    { id: 'licenseNumber', name: 'licenseNumber', label: 'Scrap Trade / Authorization License No.', type: 'text', placeholder: 'e.g. PCB/SCRAP/2026/0892', order: 5 },
                    { id: 'gstNumber', name: 'gstNumber', label: 'GST Number', type: 'text', placeholder: 'e.g. 27AAACS1234P1Z5', order: 6 },
                    { id: 'panNumber', name: 'panNumber', label: 'PAN Number', type: 'text', placeholder: 'e.g. AAACS1234P', order: 7 },
                    { id: 'address', name: 'address', label: 'Yard / Office Address', type: 'textarea', placeholder: 'Enter scrap yard address', order: 8 },
                    { id: 'status', name: 'status', label: 'Dealer Status', type: 'select', options: [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }], order: 9 }
                ]
            },
            {
                name: 'Supplier (Purchaser Name) Form',
                slug: 'supplier-form',
                description: 'Configure customizable fields for Suppliers and Procurement Sources used in tool creation, imports, and inventory tracking.',
                isActive: true,
                fields: [
                    { id: 'name', name: 'name', label: 'Supplier / Company Name', type: 'text', placeholder: 'e.g. HILTI INDIA PRIVATE LIMITED', validations: [{ type: 'required', message: 'Supplier Name is required' }], order: 0 },
                    { id: 'code', name: 'code', label: 'Supplier Code', type: 'text', placeholder: 'e.g. SUP-0001', validations: [{ type: 'required', message: 'Code is required' }], order: 1 },
                    { id: 'contactPerson', name: 'contactPerson', label: 'Sales / Account Representative', type: 'text', placeholder: 'e.g. Amit Sharma', order: 2 },
                    { id: 'contactEmail', name: 'contactEmail', label: 'Corporate Email Address', type: 'email', placeholder: 'e.g. sales@hilti.com', order: 3 },
                    { id: 'contactPhone', name: 'contactPhone', label: 'Contact Phone Number', type: 'text', placeholder: 'e.g. 1800 102 4400', validations: [{ type: 'required', message: 'Phone number is required' }], order: 4 },
                    { id: 'licenseNumber', name: 'licenseNumber', label: 'Trade / Manufacturing License No.', type: 'text', placeholder: 'e.g. IND-MFG-9842', order: 5 },
                    { id: 'gstNumber', name: 'gstNumber', label: 'GST Identification Number', type: 'text', placeholder: 'e.g. 07AAACH0042P1Z3', order: 6 },
                    { id: 'panNumber', name: 'panNumber', label: 'Company PAN', type: 'text', placeholder: 'e.g. AAACH0042P', order: 7 },
                    { id: 'address', name: 'address', label: 'Corporate / Regional Office Address', type: 'textarea', placeholder: 'Enter corporate address', order: 8 },
                    { id: 'status', name: 'status', label: 'Supplier Status', type: 'select', options: [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }], order: 9 }
                ]
            }
        ];

        for (const f of defaultForms) {
            const existing = await FormDefinition.findOne({ slug: f.slug });
            if (!existing) {
                await FormDefinition.create(f);
                console.log(`[Migration] Created default form schema '${f.name}' (${f.slug}).`);
            }
        }

        console.log('[Migration] Profile migration & Form definitions check completed.');
    } catch (err) {
        console.error('[Migration] Error during profile migration:', err);
    }
};

export default migrateProfilesAndForms;
