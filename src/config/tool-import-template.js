import * as XLSX from 'xlsx';

const KNOWN_FIELD_ALIASES = {
    description: ['description', 'tool_name', 'tool name', 'name', 'item_description'],
    toolCode: ['toolcode', 'tool_code', 'tool code', 'itemcode', 'item_code', 'item code'],
    makeYear: ['makeyear', 'make_year', 'make year', 'make'],
    capacity: ['capacity', 'cap'],
    safeWorkingLoad: ['safeworkingload', 'safe_working_load', 'safe working load', 'swl'],
    toolType: ['tooltype', 'tool_type', 'tool type', 'category'],
    metalType: ['metaltype', 'metal_type', 'metal type', 'metal'],
    toolVariant: ['toolvariant', 'tool_variant', 'tool variant', 'toolvarient', 'tool_varient', 'tool varient', 'variant', 'varient'],
    purchaserName: ['purchasername', 'purchaser_name', 'purchaser name', 'purchaser'],
    purchaserContact: ['purchasercontact', 'purchaser_contact', 'purchaser contact'],
    supplierCode: ['suppliercode', 'supplier_code', 'supplier code'],
    dateOfSupply: ['dateofsupply', 'date_of_supply', 'date of supply', 'supply_date', 'date'],
    jobCode: ['jobcode', 'job_code', 'job code'],
    jobDescription: ['jobdescription', 'job_description', 'job description'],
    currentSite: ['currentsite', 'current_site', 'current site', 'site', 'store', 'store_name']
};

export const PREFERRED_COLUMN_ORDER = [
    { name: 'description', header: 'description', type: 'text', required: true, example: 'HYDRAULIC JACK' },
    { name: 'makeYear', header: 'make', type: 'text', required: false, example: '2024' },
    { name: 'capacity', header: 'capacity', type: 'text', required: false, example: '50T' },
    { name: 'safeWorkingLoad', header: 'safe_working_load', type: 'text', required: false, example: '50 Tons' },
    { name: 'purchaserName', header: 'purchaser_name', type: 'text', required: false, example: 'LARSEN TOUBRO' },
    { name: 'supplierCode', header: 'supplier_code', type: 'text', required: false, example: 'SUP-001' },
    { name: 'dateOfSupply', header: 'date_of_supply', type: 'date', required: false, example: '31/08/2025' },
    { name: 'toolType', header: 'tool_type', type: 'text', required: false, example: 'Heavy Equipment' },
    { name: 'metalType', header: 'metal_type', type: 'text', required: false, example: 'STEEL' },
    { name: 'toolVariant', header: 'tool_varient', type: 'text', required: false, example: 'SINGLE OPEN PULLY' },
    { name: 'purchaserContact', header: 'purchaser_contact', type: 'text', required: false, example: '+919876543210' },
    { name: 'jobCode', header: 'job_code', type: 'text', required: false, example: 'JOB-101' },
    { name: 'jobDescription', header: 'job_description', type: 'text', required: false, example: 'Civil Lifting Work' },
    { name: 'currentSite', header: 'current_site', type: 'text', required: false, example: 'Central Site Store' },
    { name: 'validation', header: 'validation', type: 'text', required: false, example: 'Valid' },
    { name: 'toolCode', header: 'ITEM CODE', type: 'text', required: false, example: 'HJ-050' }
];

/**
 * Dynamic Source of Truth for Store Tools Bulk Import Template & Schema.
 * Builds columns automatically from customized form schemas, maintaining exact user header order.
 */
export const buildDynamicImportColumns = (formFields = []) => {
    const columns = [];
    const usedFieldNames = new Set();

    for (const pref of PREFERRED_COLUMN_ORDER) {
        const matchingField = formFields.find(f => {
            const fName = (f.name || '').toLowerCase();
            const fLabel = (f.label || '').toLowerCase();
            const pName = pref.name.toLowerCase();
            const pHeader = pref.header.toLowerCase().replace(/[^a-z0-9]/g, '');
            return fName === pName || fName === pHeader || fLabel.replace(/[^a-z0-9]/g, '') === pHeader;
        });

        if (matchingField) {
            usedFieldNames.add(matchingField.name);
        }

        const isRequired = matchingField ? (matchingField.validations?.some(v => v.type === 'required') || false) : pref.required;
        const fieldType = matchingField ? matchingField.type : pref.type;

        let formatNote = isRequired ? `[REQUIRED]` : `[OPTIONAL]`;
        if (fieldType === 'number') formatNote += ` Numeric value`;
        else if (fieldType === 'date') formatNote += ` DD/MM/YYYY`;
        else formatNote += ` ${matchingField?.placeholder || pref.example || ''}`;

        const extraAliases = KNOWN_FIELD_ALIASES[pref.name] || [];

        columns.push({
            header: pref.header,
            name: pref.name,
            required: isRequired,
            type: fieldType,
            aliases: Array.from(new Set([
                pref.header,
                pref.name,
                pref.header.toLowerCase().replace(/[^a-z0-9]/g, ''),
                pref.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
                ...extraAliases
            ])),
            formatNote: formatNote.trim(),
            exampleValues: [
                pref.example,
                '-',
                '-'
            ],
            description: matchingField?.helperText || `Data for ${pref.header}`
        });
    }

    // Append any extra custom fields not in preferred order
    for (const field of formFields) {
        if (!usedFieldNames.has(field.name)) {
            const isRequired = field.validations?.some(v => v.type === 'required') || false;
            let formatNote = isRequired ? `[REQUIRED]` : `[OPTIONAL]`;
            columns.push({
                header: field.label,
                name: field.name,
                required: isRequired,
                type: field.type,
                aliases: [
                    field.label,
                    field.name,
                    field.label.toLowerCase().replace(/[^a-z0-9]/g, ''),
                    field.name.toLowerCase().replace(/[^a-z0-9]/g, '')
                ],
                formatNote: formatNote.trim(),
                exampleValues: [field.placeholder || '-', '-', '-'],
                description: field.helperText || `Data for ${field.label}`
            });
        }
    }

    return columns;
};

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
 * Extracts a column value from an imported row using the column definition's aliases and global alias mappings.
 */
export const getColumnValue = (row, columnDef) => {
    if (!columnDef) return undefined;
    const keys = Object.keys(row);
    const colName = columnDef.name || '';
    const knownAliases = KNOWN_FIELD_ALIASES[colName] || [];

    for (let k of keys) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');

        // 1. Check definition aliases
        for (let alias of (columnDef.aliases || [])) {
            if (normK === alias.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                return row[k];
            }
        }

        // 2. Check global KNOWN_FIELD_ALIASES
        for (let alias of knownAliases) {
            if (normK === alias.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                return row[k];
            }
        }
    }
    return undefined;
};

/**
 * Generates the complete Sample Excel (.xlsx) workbook Buffer dynamically from form fields.
 */
export const generateDynamicSampleExcelWorkbook = (formFields = []) => {
    const workbook = XLSX.utils.book_new();
    const dynamicColumns = buildDynamicImportColumns(formFields);

    // 1. Build Primary Sheet: "Tools Import Template"
    const headers = dynamicColumns.map(col => col.header);
    const formatNotes = dynamicColumns.map(col => col.formatNote);

    const sampleRow1 = dynamicColumns.map(col => col.exampleValues[0] || '');
    const sampleRow2 = dynamicColumns.map(col => col.exampleValues[1] || '');
    const sampleRow3 = dynamicColumns.map(col => col.exampleValues[2] || '');

    const templateAOA = [
        headers,
        formatNotes,
        sampleRow1,
        sampleRow2,
        sampleRow3
    ];

    const templateSheet = XLSX.utils.aoa_to_sheet(templateAOA);

    // Auto-fit column widths for readability
    templateSheet['!cols'] = dynamicColumns.map(col => ({
        wch: Math.max(
            col.header.length + 4,
            col.formatNote.length + 2,
            ...col.exampleValues.map(v => String(v).length + 2),
            18
        )
    }));

    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Tools Import Template');

    // 2. Build Secondary Sheet: "Field Format Guide"
    const guideHeaders = ['Column Name', 'Field Key', 'Requirement', 'Format / Rule', 'Description'];
    const guideRows = dynamicColumns.map(col => [
        col.header,
        col.name,
        col.required ? 'REQUIRED' : 'OPTIONAL',
        col.formatNote.replace(/^\[(REQUIRED|OPTIONAL)\]\s*/i, ''),
        col.description
    ]);

    const guideAOA = [guideHeaders, ...guideRows];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideAOA);

    guideSheet['!cols'] = [
        { wch: 22 }, // Column Name
        { wch: 18 }, // Field Key
        { wch: 14 }, // Requirement
        { wch: 45 }, // Format / Rule
        { wch: 60 }  // Description
    ];

    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Field Format Guide');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
};

