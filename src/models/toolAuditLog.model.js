import mongoose from 'mongoose';

const toolAuditLogSchema = new mongoose.Schema({
    user: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, default: 'System User' },
        email: { type: String, default: 'system@landt.com' }
    },
    dateTime: { type: Date, default: Date.now },
    action: { 
        type: String, 
        default: 'Bulk Edit',
        index: true 
    },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    affectedToolsCount: { type: Number, required: true },
    toolIds: [{ type: String }],
    updatesApplied: { type: mongoose.Schema.Types.Mixed, default: {} },
    snapshots: [
        {
            toolId: { type: String },
            _id: { type: mongoose.Schema.Types.ObjectId },
            oldValues: { type: mongoose.Schema.Types.Mixed },
            newValues: { type: mongoose.Schema.Types.Mixed }
        }
    ],
    remarks: { type: String, default: '' }
}, {
    timestamps: true
});

export const ToolAuditLog = mongoose.model('ToolAuditLog', toolAuditLogSchema);
export default ToolAuditLog;
