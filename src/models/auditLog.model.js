import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true
    },
    targetRequestId: {
        type: String,
        default: ''
    },
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
