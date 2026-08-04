import mongoose from 'mongoose';

const toolMovementSchema = new mongoose.Schema({
    tool: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true, index: true },
    toolIdStr: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    movementType: { type: String, enum: ['Delivery', 'Return', 'Missing'], required: true },
    from: { type: String, required: true }, // e.g. 'Store' or Vendor Name
    to: { type: String, required: true },   // e.g. Vendor Name or 'Store' or 'Missing'
    referenceNumber: { type: String, required: true, index: true }, // Challan number e.g. DC-2026-000001
    date: { type: Date, default: Date.now },
    user: { type: String, default: 'System User' },
    remarks: { type: String, default: '' }
}, {
    timestamps: true
});

export const ToolMovement = mongoose.model('ToolMovement', toolMovementSchema);
export default ToolMovement;
