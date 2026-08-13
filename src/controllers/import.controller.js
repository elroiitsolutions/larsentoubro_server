import * as xlsx from 'xlsx';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';
import { ImportJob } from '../models/importJob.model.js';
import ToolIdGenerator from '../utils/tool-id.js';
import { 
    buildDynamicImportColumns,
    isInstructionRow, 
    getColumnValue, 
    generateDynamicSampleExcelWorkbook 
} from '../config/tool-import-template.js';
import { FormDefinition } from '../models/formDefinition.model.js';
import { processImportJob, addJobListener, removeJobListener } from '../services/importWorker.service.js';

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

/**
 * PREVIEW: Parse xlsx, validate rows, store in ImportJob, return summary + first page.
 * Records are now stored server-side — the client never holds 100K records in memory.
 */
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

        const parsedRecords = [];
        const projectObj = targetStore.project;
        const projectNameStr = projectObj ? (projectObj.name || projectObj.projectName || String(projectObj._id || '')) : '';
        const storeNameStr = targetStore.name || '';

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2;

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

            toolData.project = projectObj ? projectObj._id : targetStore._id;
            toolData.currentSite = targetStore._id;
            toolData.projectName = projectNameStr;
            toolData.storeName = storeNameStr;

            for (const colDef of dynamicColumns) {
                let val = getColumnValue(row, colDef);
                
                const colNameNorm = (colDef.name || '').toLowerCase();
                const colHeaderNorm = (colDef.header || '').toLowerCase();
                const isProjectCol = colNameNorm.includes('project') || colHeaderNorm.includes('project');
                const isStoreCol = colNameNorm.includes('store') || colHeaderNorm.includes('store') || colHeaderNorm.includes('site');

                if ((val === undefined || val === null || String(val).trim() === '')) {
                    if (isProjectCol && projectNameStr) {
                        val = projectNameStr;
                    } else if (isStoreCol && storeNameStr) {
                        val = storeNameStr;
                    }
                }

                if (colDef.required && (val === undefined || val === null || String(val).trim() === '')) {
                    errors.push(`${colDef.header} is required`);
                }

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

        const validCount = parsedRecords.filter(r => r.isValid).length;
        const invalidCount = parsedRecords.filter(r => !r.isValid).length;

        // Store in ImportJob instead of sending everything to the client
        const importJob = new ImportJob({
            store: targetStore._id,
            project: projectObj ? projectObj._id : undefined,
            status: 'preview_ready',
            totalRows: parsedRecords.length,
            validCount,
            invalidCount,
            columns: dynamicColumns,
            records: parsedRecords,
            originalFileName: req.file.originalname,
            createdBy: req.user?._id
        });

        await importJob.save();

        // Return summary + first page of records (not all 100K)
        const pageSize = 25;
        const firstPageRecords = parsedRecords.slice(0, pageSize);

        res.status(200).json({
            success: true,
            data: {
                jobId: importJob._id,
                totalRows: parsedRecords.length,
                validCount,
                invalidCount,
                columns: dynamicColumns,
                records: firstPageRecords,
                pagination: {
                    page: 1,
                    pageSize,
                    totalPages: Math.ceil(parsedRecords.length / pageSize)
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * GET paginated preview records from a stored ImportJob.
 * Client requests pages on demand instead of holding everything in memory.
 */
const getImportJobRecords = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 25;

        const job = await ImportJob.findById(jobId).lean();
        if (!job) {
            return res.status(404).json({ success: false, message: 'Import job not found' });
        }

        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, job.records.length);
        const records = job.records.slice(startIndex, endIndex);

        res.status(200).json({
            success: true,
            data: {
                records,
                pagination: {
                    page,
                    pageSize,
                    totalPages: Math.ceil(job.records.length / pageSize),
                    totalRecords: job.records.length
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET import job status (for page reload / polling fallback).
 */
const getImportJobStatus = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const job = await ImportJob.findById(jobId).select('-records').lean();
        
        if (!job) {
            return res.status(404).json({ success: false, message: 'Import job not found' });
        }

        res.status(200).json({
            success: true,
            data: job
        });
    } catch (error) {
        next(error);
    }
};

/**
 * COMMIT: Kick off background batch processing and return immediately.
 * The actual insert happens in importWorker.service.js via processImportJob().
 */
const commitStoreToolsImport = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        const { jobId } = req.body;
        
        const targetStore = await Store.findById(storeId).populate('project');
        if (!targetStore) {
            return res.status(404).json({ success: false, message: 'Target store not found.' });
        }

        const job = await ImportJob.findById(jobId);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Import job not found.' });
        }

        if (job.status !== 'preview_ready') {
            return res.status(400).json({ success: false, message: `Job is in '${job.status}' state. Only 'preview_ready' jobs can be committed.` });
        }

        // Mark as processing
        job.status = 'processing';
        await job.save();

        // Respond immediately — the client will track progress via SSE
        res.status(202).json({
            success: true,
            message: 'Import job started. Track progress via SSE.',
            data: {
                jobId: job._id,
                status: 'processing',
                totalToProcess: job.validCount
            }
        });

        // Fire-and-forget: process in background
        processImportJob(jobId, targetStore).catch(err => {
            console.error(`[ImportController] Background processing error for job ${jobId}:`, err);
        });

    } catch (error) {
        next(error);
    }
};

/**
 * SSE endpoint: Stream real-time progress updates for a running import job.
 */
const streamImportJobProgress = async (req, res, next) => {
    try {
        const { jobId } = req.params;

        const job = await ImportJob.findById(jobId).select('-records').lean();
        if (!job) {
            return res.status(404).json({ success: false, message: 'Import job not found' });
        }

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // If job is already completed/failed, send final state and close
        if (job.status === 'completed' || job.status === 'failed') {
            res.write(`data: ${JSON.stringify({ status: job.status, progress: job.progress })}\n\n`);
            res.end();
            return;
        }

        // Send initial state
        res.write(`data: ${JSON.stringify({ status: job.status, progress: job.progress })}\n\n`);

        // Register this response stream for progress updates
        addJobListener(jobId, res);

        // Cleanup on client disconnect
        req.on('close', () => {
            removeJobListener(jobId, res);
        });

    } catch (error) {
        next(error);
    }
};

export const importController = {
    previewStoreToolsImport,
    commitStoreToolsImport,
    downloadStoreToolsSample,
    getImportJobRecords,
    getImportJobStatus,
    streamImportJobProgress
};
