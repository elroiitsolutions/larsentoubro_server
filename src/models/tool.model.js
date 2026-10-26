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
    inspectionResult: { type: String, enum: ['Pass', 'Fail', 'Pending', null], default: null },
    inspectionAction: { type: String, enum: ['Pass', 'Repair', 'Scrap', null], default: null },
    inspectedBy: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String },
        email: { type: String }
    },
    inspectedAt: { type: Date, default: null },
    inspectionHistory: [{
        result: { type: String, enum: ['Pass', 'Fail'] },
        action: { type: String, enum: ['Pass', 'Repair', 'Scrap'] },
        validation: { type: String },
        expiryDate: { type: Date },
        inspectedBy: {
            _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            name: { type: String },
            email: { type: String }
        },
        inspectedAt: { type: Date, default: Date.now },
        notes: { type: String }
    }],
    lifeExtensionYears: { type: Number, default: 0 },
    extensionApprovedBy: { type: String },
    extensionApprovedAt: { type: Date },
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String },
        email: { type: String }
    },
    originalSerialNumber: { type: Number },
    isPrinted: { type: Boolean, default: false, index: true },
    printedAt: { type: Date, default: null },
    printedBy: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String },
        email: { type: String }
    },
    isScrapped: { type: Boolean, default: false, index: true },
    scrappedAt: { type: Date, default: null },
    scrappedBy: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String },
        email: { type: String }
    },
    scrapReason: { type: String, default: '' },
    isDisposed: { type: Boolean, default: false, index: true },
    disposedAt: { type: Date, default: null },
    disposalChallanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan', default: null },
    disposalChallanNumber: { type: String, default: '' },
    scrapDealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null }
}, {
    timestamps: true
});

// Tool ID is unique per Project
toolSchema.index({ project: 1, toolId: 1 }, { unique: true });

// Highly optimized compound indexes for Store inventory lookups, pagination, sorting & status counts
toolSchema.index({ currentSite: 1, isDeleted: 1, isScrapped: 1, serialNumber: 1 });
toolSchema.index({ currentSite: 1, isDeleted: 1, isScrapped: 1, createdAt: -1 });
toolSchema.index({ currentSite: 1, isDeleted: 1, isScrapped: 1, status: 1 });
toolSchema.index({ currentSite: 1, isDeleted: 1, isScrapped: 1, isPrinted: 1 });
toolSchema.index({ currentSite: 1, isDeleted: 1, isScrapped: 1, toolType: 1 });
toolSchema.index({ toolCode: 1 });
toolSchema.index({ currentSite: 1, toolId: 1 });

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

