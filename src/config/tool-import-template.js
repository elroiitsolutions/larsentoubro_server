import * as XLSX from 'xlsx';

/**
 * Dynamic Source of Truth for Store Tools Bulk Import Template & Schema.
 * Builds columns automatically from customized form schemas.
 */
/**
 * Builds the import columns dynamically based on the provided form fields.
 */
export const buildDynamicImportColumns = (formFields = []) => {
    // Map form fields to our column structure
    return formFields.map(field => {
        const isRequired = field.validations?.some(v => v.type === 'required') || false;
        
        let formatNote = isRequired ? `[REQUIRED]` : `[OPTIONAL]`;
        if (field.type === 'number') formatNote += ` Numeric value`;
        else if (field.type === 'date') formatNote += ` YYYY-MM-DD`;
        else if (field.type === 'select') formatNote += ` Select from: ${field.options?.map(o => o.label).join(', ') || ''}`;
        else formatNote += ` ${field.placeholder || ''}`;

        return {
            header: field.label,
            name: field.name,
            required: isRequired,
            type: field.type,
            // Automatically generate aliases
            aliases: [
                field.label, 
                field.name, 
                field.label.toLowerCase().replace(/[^a-z0-9]/g, ''),
                field.name.toLowerCase().replace(/[^a-z0-9]/g, '')
            ],
            formatNote: formatNote.trim(),
            exampleValues: [
                field.placeholder || '-',
                '-',
                '-'
            ],
            description: field.helperText || `Data for ${field.label}`
        };
    });
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
 * Extracts a column value from an imported row using the column definition's aliases.
 */
export const getColumnValue = (row, columnDef) => {
    if (!columnDef) return undefined;
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

