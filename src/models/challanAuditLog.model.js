import mongoose from 'mongoose';

const challanAuditLogSchema = new mongoose.Schema({
    user: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, default: 'System User' },
        email: { type: String, default: 'system@landt.com' }
    },
    dateTime: { type: Date, default: Date.now },
    action: { 
        type: String, 
        enum: [
            'DC Creation', 
            'DC Edit', 
            'RC Creation', 
            'Status Change', 
            'Missing Tool Update', 
            'PDF Download'
        ], 
        required: true, 
        index: true 
    },
    referenceNumber: { type: String, required: true, index: true }, // e.g. DC-2026-000001
    details: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true
});

export const ChallanAuditLog = mongoose.model('ChallanAuditLog', challanAuditLogSchema);
export default ChallanAuditLog;
