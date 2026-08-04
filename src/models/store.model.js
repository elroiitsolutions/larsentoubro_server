import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: { type: String, required: true },
    manager: { type: String, default: 'Unassigned' },
    status: { type: String, default: 'New Setup' },
    inventory: { type: Number, default: 0 },
    lastAudit: { type: String, default: '—' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true }
}, {
    timestamps: true
});

export const Store = mongoose.model('Store', storeSchema);
