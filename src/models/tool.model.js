import mongoose from 'mongoose';
import ToolIdGenerator from '../utils/tool-id.js';

const toolSchema = new mongoose.Schema({
    description: { type: String, required: true },
    toolCode: { type: String, trim: true },
    makeYear: { type: String },
    capacity: { type: String },
    safeWorkingLoad: { type: String },
    toolType: { type: String },
    metalType: { type: String },
    toolVariant: { type: String },
    purchaserName: { type: String },
    purchaserContact: { type: String },
    supplierCode: { type: String },
    dateOfSupply: { type: String },
    validityPeriod: { type: String, default: 'N/A' },
    testCertificate: { type: String },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    currentSite: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    subcontractorName: { type: String },
    subcontractorCode: { type: String },
    subcontractorMobile: { type: String },
    jobCode: { type: String },
    jobDescription: { type: String },
    remarks: { type: String },
    toolId: { type: String, index: true },
    serialNumber: { type: Number, index: true },
    qrLink: { type: String },
    status: { type: String, default: 'Available' },
    division: { type: String, default: 'Buildings & Infrastructure' },
    hub: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    manufactureDate: { type: Date },
    lastInspectionDate: { type: Date },
    nextInspectionDueDate: { type: Date },
    inspectionStatus: { type: String, default: 'Pending' },
    lifeExtensionYears: { type: Number, default: 0 },
    extensionApprovedBy: { type: String },
    extensionApprovedAt: { type: Date },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true
});

// Tool ID is unique per Project
toolSchema.index({ project: 1, toolId: 1 }, { unique: true });

// Pre-save hook to generate toolId if it doesn't exist and ensure numeric serialNumber is set
toolSchema.pre('save', async function (next) {
    if (this.isNew && !this.toolId) {
        try {
            const projectScopeKey = ToolIdGenerator.getProjectScopeKey(this);
            const serialNum = await ToolIdGenerator.allocateSerial(projectScopeKey);
            this.toolId = ToolIdGenerator.generateToolId(this, serialNum);
            this.serialNumber = serialNum;
            this.qrLink = ToolIdGenerator.generateQrLink(this.toolId);
        } catch (error) {
            console.error("Error generating toolId:", error);
            // Fallback just in case
            const fallbackCount = await mongoose.model('Tool').countDocuments();
            const fallbackSerial = (fallbackCount + 1);
            this.serialNumber = fallbackSerial;
            this.toolId = `T-${fallbackSerial.toString().padStart(4, '0')}`;
            this.qrLink = ToolIdGenerator.generateQrLink(this.toolId);
        }
    }

    if (this.toolId && (!this.serialNumber || isNaN(this.serialNumber))) {
        const match = this.toolId.match(/\d+$/);
        if (match) {
            this.serialNumber = parseInt(match[0], 10);
        }
    }
    next();
});

export const Tool = mongoose.model('Tool', toolSchema);

