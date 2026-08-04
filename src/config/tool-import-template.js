import * as XLSX from 'xlsx';

/**
 * Single Source of Truth for Store Tools Bulk Import Template & Schema.
 * Defines required columns, aliases, format rules, notes, and sample records.
 * If the import template changes in the future, modifying this array will
 * automatically update both the import parser and the downloaded sample file.
 */
export const TOOL_IMPORT_COLUMNS = [
    {
        header: 'Description',
        required: true,
        aliases: ['Description', 'description'],
        formatNote: '[REQUIRED] Full tool name or description',
        exampleValues: [
            'Hydraulic Bottle Jack 20T',
            'Electric Chain Hoist 5T',
            'Digital Torque Wrench 1/2 inch'
        ],
        description: 'The main name or description of the tool or equipment.'
    },
    {
        header: 'Tool Code',
        required: false,
        aliases: ['Tool Code', 'toolcode', 'tool_code', 'code'],
        formatNote: '[OPTIONAL] Alphanumeric tool code (e.g., TC-1001, CODE-882)',
        exampleValues: [
            'TC-1001',
            'TC-1002',
            'TC-1003'
        ],
        description: 'Alphanumeric tool identification code assigned to the equipment.'
    },
    {
        header: 'Make/Year',
        required: true,
        aliases: ['Make/Year', 'make', 'makeyear'],
        formatNote: '[REQUIRED] Make name and year (e.g., Enerpac/2024)',
        exampleValues: [
            'Enerpac / 2024',
            'Indef / 2023',
            'Snap-on / 2025'
        ],
        description: 'Manufacturer make and year of manufacturing.'
    },
    {
        header: 'Capacity',
        required: true,
        aliases: ['Capacity', 'capacity'],
        formatNote: '[REQUIRED] Value with unit (e.g., 20 Ton, 500 kg, 100 Nm)',
        exampleValues: [
            '20 Ton',
            '5 Ton',
            '100-500 Nm'
        ],
        description: 'Maximum operating capacity with unit of measurement.'
    },
    {
        header: 'Safe Working Load',
        required: true,
        aliases: ['Safe Working Load', 'safeworkingload', 'safeworking', 'swl'],
        formatNote: '[REQUIRED] Safe working load with unit (e.g., 20 Ton, 5 Ton)',
        exampleValues: [
            '20 Ton',
            '5 Ton',
            '450 Nm'
        ],
        description: 'Safe Working Load (SWL) rated for safe operation.'
    },
    {
        header: 'Tool Type',
        required: true,
        aliases: ['Tool Type', 'tooltype'],
        formatNote: '[REQUIRED] Category (e.g., Lifting Equipment, Heavy Machinery, Precision Tool)',
        exampleValues: [
            'Lifting Equipment',
            'Lifting Equipment',
            'Precision Tool'
        ],
        description: 'Category or classification of the tool.'
    },
    {
        header: 'Metal Type',
        required: true,
        aliases: ['Metal Type', 'metaltype'],
        formatNote: '[REQUIRED] Metal material (e.g., Alloy Steel, Cast Iron, Stainless Steel)',
        exampleValues: [
            'Alloy Steel',
            'Mild Steel',
            'Chrome Vanadium'
        ],
        description: 'Material composition of the tool.'
    },
    {
        header: 'Tool Variant',
        required: true,
        aliases: ['Tool Variant', 'toolvariant', 'toolvarient'],
        formatNote: '[REQUIRED] Variant type (e.g., Heavy Duty, Standard, Digital / Calibrated)',
        exampleValues: [
            'Heavy Duty',
            'Standard',
            'Digital / Calibrated'
        ],
        description: 'Specific variant or sub-model specification.'
    },
    {
        header: 'Purchaser Name',
        required: true,
        aliases: ['Purchaser Name', 'purchasername'],
        formatNote: '[REQUIRED] Name of purchasing company or contractor',
        exampleValues: [
            'L&T Construction - Heavy Civil',
            'L&T Infra Projects',
            'L&T Hydrocarbon Engineering'
        ],
        description: 'Name of the entity or department that purchased the tool.'
    },
    {
        header: 'Purchaser Contact',
        required: false,
        aliases: ['Purchaser Contact', 'purchasercontact'],
        formatNote: '[OPTIONAL] Phone number or email of purchaser',
        exampleValues: [
            '+91 98765 43210',
            '+91 98111 22334',
            '+91 97000 11223'
        ],
        description: 'Contact information for the purchaser.'
    },
    {
        header: 'Supplier Code',
        required: false,
        aliases: ['Supplier Code', 'suppliercode'],
        formatNote: '[OPTIONAL] Vendor / supplier ID code (e.g., SUP-2041, VEND-089)',
        exampleValues: [
            'SUP-2041',
            'SUP-1082',
            'SUP-3301'
        ],
        description: 'Alphanumeric code identifying the supplier or vendor.'
    },
    {
        header: 'Date of Supply',
        required: true,
        aliases: ['Date of Supply', 'dateofsupply'],
        formatNote: '[REQUIRED] Date in YYYY-MM-DD format (e.g., 2026-01-15)',
        exampleValues: [
            '2026-01-15',
            '2025-11-20',
            '2026-03-10'
        ],
        description: 'Date when the tool was supplied/received. Must be YYYY-MM-DD format.'
    },
    {
        header: 'Validity Period',
        required: false,
        aliases: ['Validity Period', 'validityperiod', 'validity'],
        formatNote: '[OPTIONAL] Calibration / inspection validity end date (e.g., 2027-01-15)',
        exampleValues: [
            '2027-01-15',
            '2026-11-20',
            '2027-03-10'
        ],
        description: 'Validity expiration date for calibration or fitness certificate.'
    },
    {
        header: 'Test Certificate',
        required: false,
        aliases: ['Test Certificate', 'testcertificate'],
        formatNote: '[OPTIONAL] Certificate number (e.g., TC-2026-881, CERT-4421)',
        exampleValues: [
            'TC-2026-881',
            'TC-2025-104',
            'TC-2026-552'
        ],
        description: 'Reference number of test or calibration certificate.'
    },
    {
        header: 'Project Name',
        required: false,
        aliases: ['Project Name', 'projectname', 'jobdescription', 'job_description'],
        formatNote: '[OPTIONAL] Project name (defaults to target store project if omitted)',
        exampleValues: [
            'Mumbai Coastal Road Project',
            'Mumbai Coastal Road Project',
            'Mumbai Coastal Road Project'
        ],
        description: 'Name of the project site.'
    },
    {
        header: 'Store Name',
        required: false,
        aliases: ['Store Name', 'storename', 'currentsite', 'current_site'],
        formatNote: '[OPTIONAL] Store / Site name (defaults to target store if omitted)',
        exampleValues: [
            'Central Equipment Store',
            'Central Equipment Store',
            'Central Equipment Store'
        ],
        description: 'Name of the current store or site.'
    },
    {
        header: 'Subcontractor Name',
        required: false,
        aliases: ['Subcontractor Name', 'subcontractorname'],
        formatNote: '[OPTIONAL] Name of subcontractor if assigned',
        exampleValues: [
            'Apex Erectors Pvt Ltd',
            'Heavy Cranes India Ltd',
            'Precision Tech Services'
        ],
        description: 'Name of subcontractor utilizing the tool.'
    },
    {
        header: 'Subcontractor Code',
        required: false,
        aliases: ['Subcontractor Code', 'subcontractorcode'],
        formatNote: '[OPTIONAL] Subcontractor code / ID (e.g., SUB-091)',
        exampleValues: [
            'SUB-091',
            'SUB-044',
            'SUB-102'
        ],
        description: 'Unique code assigned to the subcontractor.'
    },
    {
        header: 'Subcontractor Mobile',
        required: false,
        aliases: ['Subcontractor Mobile', 'subcontractormobile'],
        formatNote: '[OPTIONAL] Contact mobile number of subcontractor',
        exampleValues: [
            '+91 98222 33445',
            '+91 98333 44556',
            '+91 98444 55667'
        ],
        description: 'Mobile contact number of subcontractor supervisor.'
    },
    {
        header: 'Job Code',
        required: false,
        aliases: ['Job Code', 'jobcode'],
        formatNote: '[OPTIONAL] Internal job reference code (e.g., JC-4412)',
        exampleValues: [
            'JC-4412',
            'JC-4415',
            'JC-5001'
        ],
        description: 'Job accounting or work package reference code.'
    },
    {
        header: 'Job Description',
        required: false,
        aliases: ['Job Description', 'jobdescription'],
        formatNote: '[OPTIONAL] Specific task or job description',
        exampleValues: [
            'Bridge Girder Erection Work',
            'Heavy Equipment Lifting',
            'Structural Bolt Torque Verification'
        ],
        description: 'Description of the specific work or task where the tool is used.'
    },
    {
        header: 'Remarks',
        required: false,
        aliases: ['Remarks', 'remarks'],
        formatNote: '[OPTIONAL] Any additional remarks or notes',
        exampleValues: [
            'Tested and certified for heavy lifting',
            'Annual maintenance completed in Jan 2026',
            'Calibrated by NABL accredited lab'
        ],
        description: 'Any additional notes or inspection remarks.'
    }
];

/**
 * Checks if an imported row is an instruction / format note row (e.g. Row 2 of sample template).
 */
export const isInstructionRow = (row) => {
    if (!row || typeof row !== 'object') return false;
    const vals = Object.values(row);
    return vals.some(val => {
        const str = String(val || '').trim();
        return (
            str.startsWith('[REQUIRED]') ||
            str.startsWith('[OPTIONAL]') ||
            str.startsWith('[NOTE]') ||
            str.startsWith('[FORMAT]') ||
            str.toLowerCase().includes('full tool name or description') ||
            str.toLowerCase().includes('value with unit')
        );
    });
};

/**
 * Extracts a column value from an imported row using the column definition's aliases.
 */
export const getColumnValue = (row, columnDef) => {
    const keys = Object.keys(row);
    for (let k of keys) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let alias of columnDef.aliases) {
            if (normK === alias.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                return row[k];
            }
        }
    }
    return undefined;
};

/**
 * Generates the complete Sample Excel (.xlsx) workbook Buffer.
 * Contains:
 * - Sheet 1: "Tools Import Template" with headers, format notes, and sample records.
 * - Sheet 2: "Field Format Guide" with detailed instructions and examples for every column.
 */
export const generateSampleExcelWorkbook = () => {
    const workbook = XLSX.utils.book_new();

    // 1. Build Primary Sheet: "Tools Import Template"
    const headers = TOOL_IMPORT_COLUMNS.map(col => col.header);
    const formatNotes = TOOL_IMPORT_COLUMNS.map(col => col.formatNote);

    const sampleRow1 = TOOL_IMPORT_COLUMNS.map(col => col.exampleValues[0] || '');
    const sampleRow2 = TOOL_IMPORT_COLUMNS.map(col => col.exampleValues[1] || '');
    const sampleRow3 = TOOL_IMPORT_COLUMNS.map(col => col.exampleValues[2] || '');

    const templateAOA = [
        headers,
        formatNotes,
        sampleRow1,
        sampleRow2,
        sampleRow3
    ];

    const templateSheet = XLSX.utils.aoa_to_sheet(templateAOA);

    // Auto-fit column widths for readability
    templateSheet['!cols'] = TOOL_IMPORT_COLUMNS.map(col => ({
        wch: Math.max(
            col.header.length + 4,
            col.formatNote.length + 2,
            ...col.exampleValues.map(v => String(v).length + 2),
            18
        )
    }));

    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Tools Import Template');

    // 2. Build Secondary Sheet: "Field Format Guide"
    const guideHeaders = ['Column Name', 'Requirement', 'Format / Rule', 'Example Value', 'Description'];
    const guideRows = TOOL_IMPORT_COLUMNS.map(col => [
        col.header,
        col.required ? 'REQUIRED' : 'OPTIONAL',
        col.formatNote.replace(/^\[(REQUIRED|OPTIONAL)\]\s*/i, ''),
        col.exampleValues[0] || '-',
        col.description
    ]);

    const guideAOA = [guideHeaders, ...guideRows];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideAOA);

    guideSheet['!cols'] = [
        { wch: 22 }, // Column Name
        { wch: 14 }, // Requirement
        { wch: 45 }, // Format / Rule
        { wch: 32 }, // Example Value
        { wch: 60 }  // Description
    ];

    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Field Format Guide');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
};
