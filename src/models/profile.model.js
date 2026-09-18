import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    documentType: {
        type: String,
        enum: ['Aadhaar Card', 'PAN Card', 'GST Certificate', 'Business Agreement', 'Trade License', 'Scrap License', 'Other'],
        default: 'Other'
    },
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    filePath: { type: String },
    fileType: { type: String },
    fileSize: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: 'System' }
});

const profileSchema = new mongoose.Schema({
    profileType: {
        type: String,
        enum: ['Subcontractor', 'ScrapDealer', 'Supplier'],
        required: true,
        index: true
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    contactPerson: { type: String, default: '' },
    contactDesignation: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    alternatePhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    address: { type: String, default: '' },
    gstNumber: { type: String, default: '', uppercase: true, trim: true },
    panNumber: { type: String, default: '', uppercase: true, trim: true },
    aadhaarNumber: { type: String, default: '', trim: true },
    licenseNumber: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active', index: true },
    projects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: []
    }],
    stores: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        default: []
    }],
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    documents: [documentSchema],
    metrics: {
        dcCount: { type: Number, default: 0 },
        rcCount: { type: Number, default: 0 },
        returnedCount: { type: Number, default: 0 },
        missingCount: { type: Number, default: 0 },
        scrapCount: { type: Number, default: 0 },
        supplyCount: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Ensure uniqueness of code per profileType
profileSchema.index({ profileType: 1, code: 1 }, { unique: true });

export const Profile = mongoose.model('Profile', profileSchema);
export default Profile;
