import mongoose from 'mongoose';

/**
 * ImportJob Model
 * Stores bulk import job metadata and parsed records server-side.
 * This eliminates the need to send 100K+ records to the client and back.
 */
const importJobSchema = new mongoose.Schema({
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    status: {
        type: String,
        enum: ['parsing', 'preview_ready', 'processing', 'completed', 'failed'],
        default: 'parsing'
    },
    // Summary stats
    totalRows: { type: Number, default: 0 },
    validCount: { type: Number, default: 0 },
    invalidCount: { type: Number, default: 0 },
    // Column definitions for the preview table
    columns: { type: Array, default: [] },
    // All parsed records stored server-side (valid + invalid for review)
    records: { type: Array, default: [] },
    // Import progress tracking
    progress: {
        processedCount: { type: Number, default: 0 },
        successCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        failedRows: { type: Array, default: [] },
        percentage: { type: Number, default: 0 }
    },
    // Metadata
    originalFileName: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date }
}, {
    timestamps: true
});

// Auto-cleanup: TTL index removes jobs older than 24 hours
importJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const ImportJob = mongoose.model('ImportJob', importJobSchema);
