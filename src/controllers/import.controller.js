import * as xlsx from 'xlsx';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';
import ToolIdGenerator from '../utils/tool-id.js';
import { 
    TOOL_IMPORT_COLUMNS, 
    isInstructionRow, 
    getColumnValue, 
    generateSampleExcelWorkbook 
} from '../config/tool-import-template.js';

const downloadStoreToolsSample = async (req, res, next) => {
    try {
        const buffer = generateSampleExcelWorkbook();
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

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2; // +1 for 0-index, +1 for header

            // Skip instruction or note rows automatically
            if (isInstructionRow(row)) {
                continue;
            }

            // Extract values using the centralized TOOL_IMPORT_COLUMNS definitions
            const getCol = (header) => TOOL_IMPORT_COLUMNS.find(c => c.header === header);
            const Description = getColumnValue(row, getCol('Description'));
            const toolCode = getColumnValue(row, getCol('Tool Code'));
            const makeYear = getColumnValue(row, getCol('Make/Year'));
            const Capacity = getColumnValue(row, getCol('Capacity'));
            const safeWorkingLoad = getColumnValue(row, getCol('Safe Working Load'));
            const toolType = getColumnValue(row, getCol('Tool Type'));
            const metalType = getColumnValue(row, getCol('Metal Type'));
            const toolVariant = getColumnValue(row, getCol('Tool Variant'));
            const purchaserName = getColumnValue(row, getCol('Purchaser Name'));
            const purchaserContact = getColumnValue(row, getCol('Purchaser Contact'));
            const supplierCode = getColumnValue(row, getCol('Supplier Code'));
            const dateOfSupply = getColumnValue(row, getCol('Date of Supply'));
            const validityPeriod = getColumnValue(row, getCol('Validity Period'));
            const testCertificate = getColumnValue(row, getCol('Test Certificate'));
            
            // The user's excel uses 'job_description' for the project name and 'current_site' for the store name
            const projectName = getColumnValue(row, getCol('Project Name'));
            const storeName = getColumnValue(row, getCol('Store Name'));
            
            const subcontractorName = getColumnValue(row, getCol('Subcontractor Name'));
            const subcontractorCode = getColumnValue(row, getCol('Subcontractor Code'));
            const subcontractorMobile = getColumnValue(row, getCol('Subcontractor Mobile'));
            const jobCode = getColumnValue(row, getCol('Job Code'));
            const jobDescription = getColumnValue(row, getCol('Job Description'));
            const Remarks = getColumnValue(row, getCol('Remarks'));

            const errors = [];
            let projectId = null;
            let storeId = null;

            // 1. Basic required fields validation
            if (!Description) errors.push('Description is required');
            if (!makeYear) errors.push('Make/Year is required');
            if (!Capacity) errors.push('Capacity is required');
            if (!safeWorkingLoad) errors.push('Safe Working Load is required');
            if (!toolType) errors.push('Tool Type is required');
            if (!metalType) errors.push('Metal Type is required');
            if (!toolVariant) errors.push('Tool Variant is required');
            if (!purchaserName) errors.push('Purchaser Name is required');
            if (!dateOfSupply) errors.push('Date of Supply is required');

            // 2. Override Project and Store Lookup using URL context
            projectId = targetStore.project._id;
            storeId = targetStore._id;
            const actualProjectName = targetStore.project.name;
            const actualStoreName = targetStore.name;

            // 4. Construct tool payload
            const toolData = {
                description: Description ? String(Description) : '',
                toolCode: toolCode ? String(toolCode).trim() : undefined,
                makeYear: makeYear ? String(makeYear) : '',
                capacity: Capacity ? String(Capacity) : '',
                safeWorkingLoad: safeWorkingLoad ? String(safeWorkingLoad) : '',
                toolType: toolType ? String(toolType) : '',
                metalType: metalType ? String(metalType) : '',
                toolVariant: toolVariant ? String(toolVariant) : '',
                purchaserName: purchaserName ? String(purchaserName) : '',
                purchaserContact: purchaserContact ? String(purchaserContact) : undefined,
                supplierCode: supplierCode ? String(supplierCode) : undefined,
                dateOfSupply: dateOfSupply ? String(dateOfSupply) : '', // Format should be YYYY-MM-DD
                validityPeriod: validityPeriod ? String(validityPeriod) : '',
                testCertificate: testCertificate ? String(testCertificate) : undefined,
                project: projectId,
                currentSite: storeId,
                projectName: actualProjectName,
                storeName: actualStoreName,
                subcontractorName: subcontractorName ? String(subcontractorName) : undefined,
                subcontractorCode: subcontractorCode ? String(subcontractorCode) : undefined,
                subcontractorMobile: subcontractorMobile ? String(subcontractorMobile) : undefined,
                jobCode: jobCode ? String(jobCode) : undefined,
                jobDescription: jobDescription ? String(jobDescription) : undefined,
                remarks: Remarks ? String(Remarks) : undefined,
                isValid: errors.length === 0,
                errors,
                rowNumber
            };

            parsedRecords.push(toolData);
        }

        res.status(200).json({
            success: true,
            data: {
                totalRows: parsedRecords.length,
                validCount: parsedRecords.filter(r => r.isValid).length,
                invalidCount: parsedRecords.filter(r => !r.isValid).length,
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
                    project: targetStore.project._id,
                    currentSite: targetStore._id
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
