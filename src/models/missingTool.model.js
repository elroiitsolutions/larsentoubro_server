import mongoose from 'mongoose';

const missingToolSchema = new mongoose.Schema({
    tool: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true, index: true },
    toolIdStr: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    toolCode: { type: String, default: '' },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: false, index: true },
    vendorName: { type: String, default: '' },
    dcNumber: { type: String, default: '', index: true },
    rcNumber: { type: String, default: '', index: true },
    missingDate: { type: Date, default: Date.now },
    reportedBy: { type: String, default: 'System User' },
    remarks: { type: String, default: '' },
    status: { type: String, default: 'Missing' }
}, {
    timestamps: true
});

export const MissingTool = mongoose.model('MissingTool', missingToolSchema);
export default MissingTool;
