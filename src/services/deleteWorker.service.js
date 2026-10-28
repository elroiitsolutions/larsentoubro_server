import { Tool } from '../models/tool.model.js';
import ToolAuditLog from '../models/toolAuditLog.model.js';
import { resequenceProjectToolSerials, invalidateStoreStatusCache } from './tool.service.js';

/**
 * [SHARED] & [WEB] Bulk / Async Tool Delete Background Worker Service
 * - Handles background batch database updates for deleting unprinted tools to Trash.
 * - Progressively re-sequences remaining active tool IDs in batches of 500.
 * - Streams live progress via SSE to the web client.
 */

const BATCH_SIZE = 500;

// In-memory registry of delete jobs
const deleteJobs = new Map();

// In-memory event listeners for SSE progress streams: jobId -> Set of response objects
const deleteJobListeners = new Map();

/**
 * Register an SSE response stream for a delete job ID
 */
export const addDeleteJobListener = (jobId, res) => {
    if (!deleteJobListeners.has(jobId)) {
        deleteJobListeners.set(jobId, new Set());
    }
    deleteJobListeners.get(jobId).add(res);
};

/**
 * Remove an SSE response stream when client disconnects
 */
export const removeDeleteJobListener = (jobId, res) => {
    const listeners = deleteJobListeners.get(jobId);
    if (listeners) {
        listeners.delete(res);
        if (listeners.size === 0) {
            deleteJobListeners.delete(jobId);
        }
    }
};

/**
 * Send progress update to all SSE listeners for a delete job
 */
export const emitDeleteProgress = (jobId, data) => {
    const listeners = deleteJobListeners.get(jobId);
    if (listeners) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        for (const res of listeners) {
            try {
                res.write(payload);
            } catch (e) {
                // Client disconnected, cleanup handled by close event
            }
        }
    }
};

/**
 * Retrieve status snapshot of a delete job
 */
export const getDeleteJob = (jobId) => {
    return deleteJobs.get(jobId) || null;
};

/**
 * Initialize and start a delete job asynchronously
 */
export const startDeleteJob = async ({ toolIds, storeId, user }) => {
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error('Tool IDs are required to start a delete job');
    }

    if (user && user.role !== 'Admin') {
        throw new Error('Access denied. Only Admins can delete tools.');
    }

    const jobId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const job = {
        id: jobId,
        status: 'processing', // 'processing' | 'completed' | 'failed'
        stage: 'validating',
        message: 'Validating selected tools...',
        percentage: 5,
        deletedCount: 0,
        totalToDelete: toolIds.length,
        resequencedCount: 0,
        totalToResequence: 0,
        error: null,
        createdAt: new Date(),
        completedAt: null
    };

    deleteJobs.set(jobId, job);

    // Keep memory clean: remove jobs older than 1 hour
    const ONE_HOUR = 60 * 60 * 1000;
    setTimeout(() => {
        deleteJobs.delete(jobId);
    }, ONE_HOUR);

    // Run job asynchronously in background
    setImmediate(async () => {
        try {
            emitDeleteProgress(jobId, job);

            let query = {
                _id: { $in: toolIds },
                isDeleted: { $ne: true },
                isScrapped: { $ne: true }
            };

            if (storeId) {
                query.$or = [
                    { currentSite: storeId },
                    { store: storeId }
                ];
            }

            const toolsToDelete = await Tool.find(query).lean();

            if (!toolsToDelete || toolsToDelete.length === 0) {
                job.status = 'completed';
                job.stage = 'completed';
                job.percentage = 100;
                job.message = 'No active unprinted tools found to delete.';
                job.completedAt = new Date();
                emitDeleteProgress(jobId, job);
                return;
            }

            // Strictly disallow deleting printed tools
            const printedTools = toolsToDelete.filter(t => t.isPrinted);
            if (printedTools.length > 0) {
                const err = `Cannot delete: ${printedTools.length} selected tool(s) are printed. Only unprinted tools can be deleted.`;
                job.status = 'failed';
                job.error = err;
                job.message = err;
                emitDeleteProgress(jobId, job);
                return;
            }

            const totalToDelete = toolsToDelete.length;
            job.totalToDelete = totalToDelete;
            job.stage = 'deleting';
            job.message = `Moving ${totalToDelete} tool(s) to Trash...`;
            job.percentage = 10;
            emitDeleteProgress(jobId, job);

            const affectedProjectIds = new Set();
            const targetToolIds = [];
            const userInfo = {
                _id: user?._id || null,
                name: user?.name || user?.username || 'Admin User',
                email: user?.email || 'admin@landt.com'
            };

            const deleteOps = [];
            for (const tool of toolsToDelete) {
                targetToolIds.push(tool.toolId || tool._id.toString());
                const originalSerial = tool.originalSerialNumber || tool.serialNumber;
                const trashedId = (tool.toolId && !tool.toolId.startsWith('__TRASHED_'))
                    ? `__TRASHED_${tool._id}_${tool.toolId}`
                    : tool.toolId;

                deleteOps.push({
                    updateOne: {
                        filter: { _id: tool._id },
                        update: {
                            $set: {
                                originalSerialNumber: originalSerial,
                                isDeleted: true,
                                isScrapped: false,
                                status: 'Deleted',
                                deletedAt: new Date(),
                                deletedBy: userInfo,
                                toolId: trashedId
                            }
                        }
                    }
                });

                if (tool.project) affectedProjectIds.add(tool.project.toString());
                else if (tool.currentSite) affectedProjectIds.add(tool.currentSite.toString());
            }

            // Execute delete ops in batches of 500
            for (let i = 0; i < deleteOps.length; i += BATCH_SIZE) {
                const chunk = deleteOps.slice(i, i + BATCH_SIZE);
                await Tool.bulkWrite(chunk, { ordered: false });
                job.deletedCount = Math.min(i + chunk.length, totalToDelete);
                job.percentage = 10 + Math.round((job.deletedCount / totalToDelete) * 15); // 10% - 25%
                job.message = `Moved ${job.deletedCount} of ${totalToDelete} tool(s) to Trash...`;
                emitDeleteProgress(jobId, job);
            }

            // Create audit log
            const auditLog = new ToolAuditLog({
                user: userInfo,
                dateTime: new Date(),
                action: 'Bulk Delete Unprinted Tools',
                store: storeId || undefined,
                affectedToolsCount: toolsToDelete.length,
                toolIds: targetToolIds,
                remarks: `Bulk soft-deleted ${toolsToDelete.length} unprinted tools to Trash`
            });
            await auditLog.save();

            // Re-sequence remaining active tools
            job.stage = 'resequencing';
            job.message = 'Calculating sequence for remaining active tools...';
            job.percentage = 25;
            emitDeleteProgress(jobId, job);

            for (const projId of affectedProjectIds) {
                await resequenceProjectToolSerials(projId, ({ stage, message, percentage, processedCount, totalCount }) => {
                    const scaledPercent = 25 + Math.round((percentage || 0) * 0.70); // 25% - 95%
                    job.percentage = Math.min(scaledPercent, 95);
                    job.stage = stage || 'resequencing';
                    job.message = message || 'Re-sequencing active tool IDs in batches...';
                    job.resequencedCount = processedCount || 0;
                    job.totalToResequence = totalCount || 0;
                    emitDeleteProgress(jobId, job);
                });
            }

            if (storeId) {
                invalidateStoreStatusCache(storeId);
            }

            // Complete
            job.status = 'completed';
            job.percentage = 100;
            job.stage = 'completed';
            job.message = `Successfully deleted ${totalToDelete} tool(s). All remaining active tools have been automatically re-sequenced.`;
            job.completedAt = new Date();
            emitDeleteProgress(jobId, job);

        } catch (error) {
            console.error(`[DeleteWorker] Job ${jobId} error:`, error);
            job.status = 'failed';
            job.error = error.message || 'Failed to complete tool deletion';
            job.message = job.error;
            emitDeleteProgress(jobId, job);
        }
    });

    return job;
};
