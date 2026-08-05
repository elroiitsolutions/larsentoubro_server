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
    toolId: { type: String, unique: true },
    qrLink: { type: String },
    status: { type: String, default: 'Available' },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true
});

// Pre-save hook to generate toolId if it doesn't exist
toolSchema.pre('save', async function (next) {
    if (this.isNew && !this.toolId) {
        try {
            const prefix = ToolIdGenerator.generateToolIdPrefix(this);

            // 7. Running Serial Number (unlimited length global, minimum 3 digits)
            const startSerial = await ToolIdGenerator.allocateSerials(1);
            const serial = startSerial.toString().padStart(3, '0');

            this.toolId = `${prefix}${serial}`;
            this.qrLink = `https://lntqr.com/${this.toolId}`;
        } catch (error) {
            console.error("Error generating toolId:", error);
            // Fallback just in case
            const fallbackCount = await mongoose.model('Tool').countDocuments();
            this.toolId = `T-${(fallbackCount + 1).toString().padStart(3, '0')}`;
            this.qrLink = `https://lntqr.com/${this.toolId}`;
        }
    }
    next();
});

export const Tool = mongoose.model('Tool', toolSchema);
