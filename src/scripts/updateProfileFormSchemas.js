import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const subcontractorFields = [
  {
    id: 'name',
    name: 'name',
    label: 'Subcontractor / Vendor Name',
    type: 'text',
    placeholder: 'e.g. RADHE SWAMI CONSTRUCTION',
    options: [],
    validations: [{ type: 'required', message: 'Subcontractor / Vendor Name is required' }],
    required: true,
    order: 0,
    disabled: false,
    readOnly: false
  },
  {
    id: 'code',
    name: 'code',
    label: 'Profile Code',
    type: 'text',
    placeholder: 'e.g. SUB-0001',
    options: [],
    validations: [],
    required: false,
    order: 1,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactPerson',
    name: 'contactPerson',
    label: 'Contact Person Name',
    type: 'text',
    placeholder: 'e.g. Dinesh G',
    options: [],
    validations: [],
    required: false,
    order: 2,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactDesignation',
    name: 'contactDesignation',
    label: 'Designation',
    type: 'text',
    placeholder: 'e.g. Site Manager / Proprietor',
    options: [],
    validations: [],
    required: false,
    order: 3,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactPhone',
    name: 'contactPhone',
    label: 'Primary Phone Number',
    type: 'text',
    placeholder: 'e.g. 9934110587',
    options: [],
    validations: [{ type: 'required', message: 'Primary phone is required' }],
    required: true,
    order: 4,
    disabled: false,
    readOnly: false
  },
  {
    id: 'alternatePhone',
    name: 'alternatePhone',
    label: 'Alternate Phone Number',
    type: 'text',
    placeholder: 'e.g. 9876543210',
    options: [],
    validations: [],
    required: false,
    order: 5,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactEmail',
    name: 'contactEmail',
    label: 'Email Address',
    type: 'email',
    placeholder: 'e.g. contact@company.com',
    options: [],
    validations: [],
    required: false,
    order: 6,
    disabled: false,
    readOnly: false
  },
  {
    id: 'gstNumber',
    name: 'gstNumber',
    label: 'GST Number',
    type: 'text',
    placeholder: 'e.g. 27AAACL0140P1Z0',
    options: [],
    validations: [],
    required: false,
    order: 7,
    disabled: false,
    readOnly: false
  },
  {
    id: 'panNumber',
    name: 'panNumber',
    label: 'PAN Number',
    type: 'text',
    placeholder: 'e.g. AAACL0140P',
    options: [],
    validations: [],
    required: false,
    order: 8,
    disabled: false,
    readOnly: false
  },
  {
    id: 'aadhaarNumber',
    name: 'aadhaarNumber',
    label: 'Aadhaar Number',
    type: 'text',
    placeholder: 'e.g. 1234-5678-9012',
    options: [],
    validations: [],
    required: false,
    order: 9,
    disabled: false,
    readOnly: false
  },
  {
    id: 'licenseNumber',
    name: 'licenseNumber',
    label: 'Trade / Operating License No.',
    type: 'text',
    placeholder: 'e.g. LIC-2026-9812',
    options: [],
    validations: [],
    required: false,
    order: 10,
    disabled: false,
    readOnly: false
  },
  {
    id: 'address',
    name: 'address',
    label: 'Office / Site / Yard Address',
    type: 'textarea',
    placeholder: 'Enter registered business or site address',
    options: [],
    validations: [],
    required: false,
    order: 11,
    disabled: false,
    readOnly: false
  }
];

const scrapFields = [
  {
    id: 'name',
    name: 'name',
    label: 'Scrap Dealer / Firm Name',
    type: 'text',
    placeholder: 'e.g. SHREE METALS SCRAP DEALERS',
    options: [],
    validations: [{ type: 'required', message: 'Firm name is required' }],
    required: true,
    order: 0,
    disabled: false,
    readOnly: false
  },
  {
    id: 'code',
    name: 'code',
    label: 'Profile Code',
    type: 'text',
    placeholder: 'e.g. SCR-0001',
    options: [],
    validations: [],
    required: false,
    order: 1,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactPerson',
    name: 'contactPerson',
    label: 'Contact Person Name',
    type: 'text',
    placeholder: 'e.g. Ramesh Patel',
    options: [],
    validations: [],
    required: false,
    order: 2,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactDesignation',
    name: 'contactDesignation',
    label: 'Designation',
    type: 'text',
    placeholder: 'e.g. Proprietor / Manager',
    options: [],
    validations: [],
    required: false,
    order: 3,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactPhone',
    name: 'contactPhone',
    label: 'Primary Phone Number',
    type: 'text',
    placeholder: 'e.g. 9820012345',
    options: [],
    validations: [{ type: 'required', message: 'Primary phone is required' }],
    required: true,
    order: 4,
    disabled: false,
    readOnly: false
  },
  {
    id: 'alternatePhone',
    name: 'alternatePhone',
    label: 'Alternate Phone Number',
    type: 'text',
    placeholder: 'e.g. 9876543210',
    options: [],
    validations: [],
    required: false,
    order: 5,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactEmail',
    name: 'contactEmail',
    label: 'Email Address',
    type: 'email',
    placeholder: 'e.g. ramesh@shreemetals.com',
    options: [],
    validations: [],
    required: false,
    order: 6,
    disabled: false,
    readOnly: false
  },
  {
    id: 'gstNumber',
    name: 'gstNumber',
    label: 'GST Number',
    type: 'text',
    placeholder: 'e.g. 27AAACS1234P1Z5',
    options: [],
    validations: [],
    required: false,
    order: 7,
    disabled: false,
    readOnly: false
  },
  {
    id: 'panNumber',
    name: 'panNumber',
    label: 'PAN Number',
    type: 'text',
    placeholder: 'e.g. AAACS1234P',
    options: [],
    validations: [],
    required: false,
    order: 8,
    disabled: false,
    readOnly: false
  },
  {
    id: 'aadhaarNumber',
    name: 'aadhaarNumber',
    label: 'Aadhaar Number',
    type: 'text',
    placeholder: 'e.g. 1234-5678-9012',
    options: [],
    validations: [],
    required: false,
    order: 9,
    disabled: false,
    readOnly: false
  },
  {
    id: 'licenseNumber',
    name: 'licenseNumber',
    label: 'Scrap Trade License No.',
    type: 'text',
    placeholder: 'e.g. PCB/SCRAP/2026/0892',
    options: [],
    validations: [],
    required: false,
    order: 10,
    disabled: false,
    readOnly: false
  },
  {
    id: 'address',
    name: 'address',
    label: 'Office / Site / Yard Address',
    type: 'textarea',
    placeholder: 'Enter scrap yard address',
    options: [],
    validations: [],
    required: false,
    order: 11,
    disabled: false,
    readOnly: false
  }
];

const supplierFields = [
  {
    id: 'name',
    name: 'name',
    label: 'Supplier / Purchaser Name',
    type: 'text',
    placeholder: 'e.g. HILTI INDIA PRIVATE LIMITED',
    options: [],
    validations: [{ type: 'required', message: 'Supplier Name is required' }],
    required: true,
    order: 0,
    disabled: false,
    readOnly: false
  },
  {
    id: 'code',
    name: 'code',
    label: 'Profile Code',
    type: 'text',
    placeholder: 'e.g. SUP-0001',
    options: [],
    validations: [],
    required: false,
    order: 1,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactPerson',
    name: 'contactPerson',
    label: 'Contact Person Name',
    type: 'text',
    placeholder: 'e.g. Amit Sharma',
    options: [],
    validations: [],
    required: false,
    order: 2,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactDesignation',
    name: 'contactDesignation',
    label: 'Designation',
    type: 'text',
    placeholder: 'e.g. Sales / Account Manager',
    options: [],
    validations: [],
    required: false,
    order: 3,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactPhone',
    name: 'contactPhone',
    label: 'Primary Phone Number',
    type: 'text',
    placeholder: 'e.g. 1800 102 4400',
    options: [],
    validations: [{ type: 'required', message: 'Primary phone is required' }],
    required: true,
    order: 4,
    disabled: false,
    readOnly: false
  },
  {
    id: 'alternatePhone',
    name: 'alternatePhone',
    label: 'Alternate Phone Number',
    type: 'text',
    placeholder: 'e.g. 9876543210',
    options: [],
    validations: [],
    required: false,
    order: 5,
    disabled: false,
    readOnly: false
  },
  {
    id: 'contactEmail',
    name: 'contactEmail',
    label: 'Email Address',
    type: 'email',
    placeholder: 'e.g. sales@hilti.com',
    options: [],
    validations: [],
    required: false,
    order: 6,
    disabled: false,
    readOnly: false
  },
  {
    id: 'gstNumber',
    name: 'gstNumber',
    label: 'GST Number',
    type: 'text',
    placeholder: 'e.g. 07AAACH0042P1Z3',
    options: [],
    validations: [],
    required: false,
    order: 7,
    disabled: false,
    readOnly: false
  },
  {
    id: 'panNumber',
    name: 'panNumber',
    label: 'PAN Number',
    type: 'text',
    placeholder: 'e.g. AAACH0042P',
    options: [],
    validations: [],
    required: false,
    order: 8,
    disabled: false,
    readOnly: false
  },
  {
    id: 'aadhaarNumber',
    name: 'aadhaarNumber',
    label: 'Aadhaar Number',
    type: 'text',
    placeholder: 'e.g. 1234-5678-9012',
    options: [],
    validations: [],
    required: false,
    order: 9,
    disabled: false,
    readOnly: false
  },
  {
    id: 'licenseNumber',
    name: 'licenseNumber',
    label: 'Trade / Operating License No.',
    type: 'text',
    placeholder: 'e.g. IND-MFG-9842',
    options: [],
    validations: [],
    required: false,
    order: 10,
    disabled: false,
    readOnly: false
  },
  {
    id: 'address',
    name: 'address',
    label: 'Office / Site / Yard Address',
    type: 'textarea',
    placeholder: 'Enter corporate address',
    options: [],
    validations: [],
    required: false,
    order: 11,
    disabled: false,
    readOnly: false
  }
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lt');
    console.log('Connected to MongoDB.');
    const col = mongoose.connection.collection('formdefinitions');

    async function syncForm(slug, name, fields) {
      const existing = await col.findOne({ slug });
      const standardNames = new Set(fields.map(f => f.name).concat(['status']));
      const extraCustom = (existing?.fields || []).filter(f => !standardNames.has(f.name));

      let combined = [...fields];
      extraCustom.forEach((f, idx) => {
        combined.push({
          ...f,
          order: fields.length + idx
        });
      });

      await col.updateOne(
        { slug },
        {
          $set: {
            name,
            fields: combined,
            isActive: true,
            updatedAt: new Date()
          },
          $inc: { version: 1 }
        },
        { upsert: true }
      );
      console.log(`[Success] Synced '${slug}' with ${combined.length} fields.`);
    }

    await syncForm('subcontractor-form', 'Subcontractor (Vendor) Form', subcontractorFields);
    await syncForm('scrap-dealer-form', 'Scrap Dealer Form', scrapFields);
    await syncForm('supplier-form', 'Supplier (Purchaser Name) Form', supplierFields);

    console.log('All profile forms updated successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error syncing profile forms:', err);
    process.exit(1);
  }
}

run();
