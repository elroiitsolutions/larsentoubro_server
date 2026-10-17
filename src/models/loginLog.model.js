import mongoose from 'mongoose';

const loginLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    userName: {
        type: String,
        default: 'Unknown User',
        trim: true
    },
    userEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true
    },
    role: {
        type: String,
        enum: ['Admin', 'User', 'Subuser', 'Vendor', 'Guest', 'Unknown'],
        default: 'User',
        index: true
    },
    parentUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    parentUserName: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['Success', 'Failed', 'Pending Approval', 'Approved', 'Rejected'],
        default: 'Pending Approval',
        index: true
    },
    loginAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approverName: {
        type: String,
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: null
    },
    logoutAt: {
        type: Date,
        default: null
    },
    sessionDuration: {
        type: Number, // duration in seconds
        default: null
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    },
    deviceInfo: {
        type: String,
        default: ''
    },
    requestId: {
        type: String,
        default: null,
        index: true
    }
}, { timestamps: true });

loginLogSchema.index({ loginAt: -1 });
loginLogSchema.index({ status: 1, loginAt: -1 });
loginLogSchema.index({ role: 1, loginAt: -1 });

export const LoginLog = mongoose.model('LoginLog', loginLogSchema);
export default LoginLog;
