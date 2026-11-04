import mongoose from 'mongoose';

const extensionHistorySchema = new mongoose.Schema({
    extendedAt: { type: Date, default: Date.now },
    extendedBy: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, default: 'Admin' },
        email: { type: String, default: '' }
    },
    durationDays: { type: Number, required: true },
    durationLabel: { type: String, required: true }, // '15 days', '45 days', '1 month', '3 months', '6 months'
    previousExpiresAt: { type: Date, required: true },
    newExpiresAt: { type: Date, required: true }
}, { _id: false });

const guestUserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Guest user name is required'],
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Guest user phone number is required'],
        trim: true,
        unique: true,
        index: true
    },
    formattedPhone: {
        type: String,
        trim: true,
        default: ''
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    organization: {
        type: String,
        trim: true,
        default: ''
    },
    purpose: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['Active', 'Expired', 'Disabled'],
        default: 'Active',
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    initialDurationDays: {
        type: Number,
        default: 15
    },
    totalDurationDays: {
        type: Number,
        default: 15
    },
    notificationSentAt: {
        type: Date,
        default: null
    },
    notificationStatus: {
        type: String,
        enum: ['None', 'Pending', 'Confirmed', 'Rejected', 'Expired'],
        default: 'None',
        index: true
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    createdBy: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        name: { type: String, default: 'System Admin' },
        email: { type: String, default: '' },
        role: { type: String, default: 'Admin' }
    },
    extensionHistory: [extensionHistorySchema],
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

guestUserSchema.index({ phone: 1, status: 1 });
guestUserSchema.index({ expiresAt: 1, status: 1 });
guestUserSchema.index({ 'createdBy._id': 1 });

export const GuestUser = mongoose.model('GuestUser', guestUserSchema);
export default GuestUser;

