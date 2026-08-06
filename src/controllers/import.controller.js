import * as xlsx from 'xlsx';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';
import ToolIdGenerator from '../utils/tool-id.js';
import { 
    buildDynamicImportColumns,
    isInstructionRow, 
    getColumnValue, 
    generateDynamicSampleExcelWorkbook 
} from '../config/tool-import-template.js';
import { FormDefinition } from '../models/formDefinition.model.js';

const downloadStoreToolsSample = async (req, res, next) => {
    try {
        const form = await FormDefinition.findOne({ slug: 'tool-form', isActive: true });
        const formFields = form ? form.fields : [];
        const buffer = generateDynamicSampleExcelWorkbook(formFields);
        res.setHeader('Content-Disposition', 'attachment; filename="tools_import_sample.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        next(error);
    }
};

const previewStoreToolsImport = async (req, res, next) => {
    try {
        const { storeId } = req.params;

        const targetStore = await Store.findById(storeId).populate('project');
        if (!targetStore) {
            return res.status(404).json({ success: false, message: 'Target store not found.' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        // Cache for lookups to avoid hammering the DB
        const projectCache = {};
        const storeCache = {};

        const parsedRecords = [];
        const form = await FormDefinition.findOne({ slug: 'tool-form', isActive: true });
        const formFields = form ? form.fields : [];
        const dynamicColumns = buildDynamicImportColumns(formFields);
        
        // Define base schema keys from Tool model
        const coreKeys = [
            'description', 'toolCode', 'makeYear', 'capacity', 'safeWorkingLoad',
            'toolType', 'metalType', 'toolVariant', 'purchaserName', 'purchaserContact',
            'supplierCode', 'dateOfSupply', 'validityPeriod', 'testCertificate',
            'project', 'currentSite', 'projectName', 'storeName', 
            'subcontractorName', 'subcontractorCode', 'subcontractorMobile',
            'jobCode', 'jobDescription', 'remarks'
        ];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2; // +1 for 0-index, +1 for header

            // Skip instruction or note rows automatically
            if (isInstructionRow(row)) {
                continue;
            }

            const errors = [];
            const toolData = {
                isValid: true,
                errors,
                rowNumber,
                customFields: {}
            };

            // Override Project and Store Lookup using URL context
            const projectObj = targetStore.project;
            const projectNameStr = projectObj ? (projectObj.name || projectObj.projectName || String(projectObj._id || '')) : '';
            const storeNameStr = targetStore.name || '';

            toolData.project = projectObj ? projectObj._id : targetStore._id;
            toolData.currentSite = targetStore._id;
            toolData.projectName = projectNameStr;
            toolData.storeName = storeNameStr;

            // Iterate over all dynamic columns defined by the form schema
            for (const colDef of dynamicColumns) {
                let val = getColumnValue(row, colDef);
                
                const colNameNorm = (colDef.name || '').toLowerCase();
                const colHeaderNorm = (colDef.header || '').toLowerCase();
                const isProjectCol = colNameNorm.includes('project') || colHeaderNorm.includes('project');
                const isStoreCol = colNameNorm.includes('store') || colHeaderNorm.includes('store') || colHeaderNorm.includes('site');

                // If Excel row value is missing for project or store, auto-populate from targetStore context
                if ((val === undefined || val === null || String(val).trim() === '')) {
                    if (isProjectCol && projectNameStr) {
                        val = projectNameStr;
                    } else if (isStoreCol && storeNameStr) {
                        val = storeNameStr;
                    }
                }

                // Validate required fields
                if (colDef.required && (val === undefined || val === null || String(val).trim() === '')) {
                    errors.push(`${colDef.header} is required`);
                }

                // If a value is provided, assign it to either core or custom field
                if (val !== undefined && val !== null) {
                    const stringVal = String(val).trim();
                    if (coreKeys.includes(colDef.name)) {
                        toolData[colDef.name] = stringVal;
                    } else {
                        toolData.customFields[colDef.name] = stringVal;
                    }
                }
            }

            toolData.isValid = errors.length === 0;
            parsedRecords.push(toolData);
        }

        res.status(200).json({
            success: true,
            data: {
                totalRows: parsedRecords.length,
                validCount: parsedRecords.filter(r => r.isValid).length,
                invalidCount: parsedRecords.filter(r => !r.isValid).length,
                columns: dynamicColumns,
                records: parsedRecords
            }
        });

    } catch (error) {
        next(error);
    }
};

const commitStoreToolsImport = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        const { records } = req.body;
        
        const targetStore = await Store.findById(storeId).populate('project');
        if (!targetStore) {
            return res.status(404).json({ success: false, message: 'Target store not found.' });
        }

        if (!records || !Array.isArray(records)) {
            return res.status(400).json({ success: false, message: 'Invalid payload, expected array of records' });
        }

        let successCount = 0;
        let failedRows = [];
        
        // 1. Filter out invalid records from preview phase
        const validRecords = records.filter(r => {
            if (!r.isValid) {
                failedRows.push({ row: r.rowNumber, reason: 'Record was invalid in preview phase' });
                return false;
            }
            return true;
        });

        if (validRecords.length > 0) {
            // 2. Pre-allocate serial numbers in one atomic DB operation
            const startSerial = await ToolIdGenerator.allocateSerials(validRecords.length);
            
            // 3. Generate objects in memory
            const toolsToInsert = validRecords.map((record, index) => {
                const toolData = {
                    ...record,
                    project: targetStore.project ? targetStore.project._id : targetStore._id,
                    currentSite: targetStore._id,
                    projectName: targetStore.project ? (targetStore.project.name || targetStore.project.projectName || '') : '',
                    storeName: targetStore.name || ''
                };
                
                // Generate Tool ID prefix using the utility
                const prefix = ToolIdGenerator.generateToolIdPrefix(toolData);
                
                // Assign sequential serial number based on index
                const currentSerial = startSerial + index;
                const serialStr = currentSerial.toString().padStart(3, '0');
                
                toolData.toolId = `${prefix}${serialStr}`;
                toolData.qrLink = `https://lntqr.com/${toolData.toolId}`;
                
                return toolData;
            });

            // 4. Perform massive bulk insert in a single DB roundtrip
            try {
                await Tool.insertMany(toolsToInsert, { ordered: false });
                successCount = toolsToInsert.length;
            } catch (err) {
                // If ordered: false, some might succeed and some fail.
                // err.writeErrors contains the failed ones.
                if (err.writeErrors) {
                    successCount = err.insertedDocs ? err.insertedDocs.length : 0;
                    for (const we of err.writeErrors) {
                        const originalIndex = we.index;
                        const originalRow = validRecords[originalIndex]?.rowNumber || 'Unknown';
                        failedRows.push({ row: originalRow, reason: we.errmsg });
                    }
                } else {
                    // Critical failure, none inserted
                    throw err;
                }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                successCount,
                failedCount: failedRows.length,
                failedRows
            }
        });
    } catch (error) {
        next(error);
    }
}

export const importController = {
    previewStoreToolsImport,
    commitStoreToolsImport,
    downloadStoreToolsSample
};
