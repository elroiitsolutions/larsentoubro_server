import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    projectName: { type: String },
    projectCode: { type: String },
    code: { type: String },
    department: { type: String },
    division: { type: String },
    lead: { type: String },
    status: { type: String },
    budget: { type: mongoose.Schema.Types.Mixed },
    deadline: { type: String },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true,
    strict: false
});

export const Project = mongoose.model('Project', projectSchema);
