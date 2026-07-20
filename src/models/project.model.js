import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    projectCode: { type: String },
    department: { type: String, default: 'Unassigned' },
    lead: { type: String, default: 'Unassigned' },
    status: { type: String, default: 'Planning' },
    budget: { type: mongoose.Schema.Types.Mixed },
    deadline: { type: String, default: 'TBD' }
}, {
    timestamps: true
});

export const Project = mongoose.model('Project', projectSchema);
