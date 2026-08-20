import { Tool } from '../models/tool.model.js';
import { ImportJob } from '../models/importJob.model.js';
import ToolIdGenerator from '../utils/tool-id.js';

const BATCH_SIZE = 2000;

// In-memory event emitter for SSE progress streams
const jobListeners = new Map();

/**
 * Register an SSE response stream for a job ID.
 */
export const addJobListener = (jobId, res) => {
    if (!jobListeners.has(jobId)) {
        jobListeners.set(jobId, new Set());
    }
    jobListeners.get(jobId).add(res);
};

/**
 * Remove an SSE response stream when client disconnects.
 */
export const removeJobListener = (jobId, res) => {
    const listeners = jobListeners.get(jobId);
    if (listeners) {
        listeners.delete(res);
        if (listeners.size === 0) {
            jobListeners.delete(jobId);
        }
    }
};

/**
 * Send progress update to all SSE listeners for a job.
 */
const emitProgress = (jobId, data) => {
    const listeners = jobListeners.get(jobId);
    if (listeners) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        for (const res of listeners) {
            try {
                res.write(payload);
            } catch (e) {
                // Client disconnected, cleanup handled by 'close' event
            }
        }
    }
};

/**
 * Process a committed import job in background batches.
 * This runs AFTER the HTTP response has been sent to the client.
 * 
 * @param {string} jobId - The ImportJob document ID
 * @param {object} targetStore - Populated store document with project
 */
export const processImportJob = async (jobId, targetStore) => {
    try {
        const job = await ImportJob.findById(jobId);
        if (!job) {
            console.error(`[ImportWorker] Job ${jobId} not found`);
            return;
        }

        // Filter to only valid records
        const validRecords = job.records.filter(r => r.isValid);
        const totalToProcess = validRecords.length;

        if (totalToProcess === 0) {
            await ImportJob.findByIdAndUpdate(jobId, {
                status: 'completed',
                completedAt: new Date(),
                'progress.percentage': 100
            });
            emitProgress(jobId, { status: 'completed', progress: { percentage: 100, successCount: 0, failedCount: 0, processedCount: 0, failedRows: [] } });
            return;
        }

        // Pre-allocate ALL serial numbers for this Project in one atomic operation
        const projectObj = targetStore.project;
        const projectIdStr = projectObj ? (projectObj._id || projectObj) : targetStore._id;
        const projectScopeKey = ToolIdGenerator.getProjectScopeKey({ project: projectIdStr });

        const startSerial = await ToolIdGenerator.allocateSerials(totalToProcess, projectScopeKey);

        let totalSuccess = 0;
        let totalFailed = 0;
        let allFailedRows = [];
        let processedSoFar = 0;

        // Process in batches
        for (let batchStart = 0; batchStart < totalToProcess; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, totalToProcess);
            const batch = validRecords.slice(batchStart, batchEnd);

            // Build tool documents for this batch
            const toolsToInsert = batch.map((record, batchIdx) => {
                const globalIdx = batchStart + batchIdx;
                const rawRecord = typeof record.toObject === 'function' ? record.toObject() : { ...record };

                // Delete subdocument _id so MongoDB assigns a new primary key for each Tool
                delete rawRecord._id;

                const toolData = {
                    ...rawRecord,
                    project: targetStore.project ? targetStore.project._id : targetStore._id,
                    currentSite: targetStore._id,
                    projectName: targetStore.project ? (targetStore.project.name || targetStore.project.projectName || '') : '',
                    storeName: targetStore.name || ''
                };

                // Remove preview-only & internal fields
                delete toolData._id;
                delete toolData.isValid;
                delete toolData.errors;
                delete toolData.rowNumber;
                delete toolData.projectName;
                delete toolData.storeName;

                const currentSerial = startSerial + globalIdx;
                toolData.serialNumber = currentSerial;
                toolData.toolId = ToolIdGenerator.generateToolId(toolData, currentSerial);
                toolData.qrLink = ToolIdGenerator.generateQrLink(toolData.toolId);

                return toolData;
            });

            // Insert this batch
            try {
                await Tool.insertMany(toolsToInsert, { ordered: false });
                totalSuccess += toolsToInsert.length;
            } catch (err) {
                if (err.writeErrors || err.result) {
                    // Partial success with ordered: false
                    const insertedCount = err.insertedDocs ? err.insertedDocs.length : 
                        (err.result?.nInserted ?? (toolsToInsert.length - (err.writeErrors?.length || 0)));
                    totalSuccess += insertedCount;
                    
                    if (err.writeErrors) {
                        for (const we of err.writeErrors) {
                            const originalBatchIdx = we.index;
                            const originalRecord = batch[originalBatchIdx];
                            totalFailed++;
                            const errMsg = we.errmsg || we.message || (we.err && we.err.errmsg) || err.message || 'Database insert error';
                            allFailedRows.push({
                                row: originalRecord?.rowNumber || 'Unknown',
                                reason: errMsg
                            });
                        }
                    }
                } else {
                    // Complete batch failure
                    totalFailed += toolsToInsert.length;
                    for (const record of batch) {
                        allFailedRows.push({
                            row: record.rowNumber || 'Unknown',
                            reason: err.message || 'Batch insert failed'
                        });
                    }
                }
            }

            processedSoFar = batchEnd;
            const percentage = Math.round((processedSoFar / totalToProcess) * 100);

            // Update job progress in DB
            await ImportJob.findByIdAndUpdate(jobId, {
                'progress.processedCount': processedSoFar,
                'progress.successCount': totalSuccess,
                'progress.failedCount': totalFailed,
                'progress.failedRows': allFailedRows.slice(-100), // Keep last 100 for display
                'progress.percentage': percentage
            });

            // Emit SSE progress event
            emitProgress(jobId, {
                status: 'processing',
                progress: {
                    processedCount: processedSoFar,
                    successCount: totalSuccess,
                    failedCount: totalFailed,
                    totalToProcess,
                    percentage,
                    failedRows: allFailedRows.slice(-10) // Send last 10 in SSE
                }
            });
        }

        // Mark job as completed
        await ImportJob.findByIdAndUpdate(jobId, {
            status: 'completed',
            completedAt: new Date(),
            'progress.processedCount': processedSoFar,
            'progress.successCount': totalSuccess,
            'progress.failedCount': totalFailed,
            'progress.failedRows': allFailedRows,
            'progress.percentage': 100
        });

        emitProgress(jobId, {
            status: 'completed',
            progress: {
                processedCount: processedSoFar,
                successCount: totalSuccess,
                failedCount: totalFailed,
                totalToProcess,
                percentage: 100,
                failedRows: allFailedRows
            }
        });

        console.log(`[ImportWorker] Job ${jobId} completed: ${totalSuccess} success, ${totalFailed} failed`);

    } catch (error) {
        console.error(`[ImportWorker] Job ${jobId} fatal error:`, error);

        await ImportJob.findByIdAndUpdate(jobId, {
            status: 'failed',
            'progress.failedRows': [{ row: '-', reason: error.message }]
        });

        emitProgress(jobId, {
            status: 'failed',
            error: error.message
        });
    }
};
