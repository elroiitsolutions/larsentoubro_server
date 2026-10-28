import { userService } from '../services/user.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';
import { LoginRequest } from '../models/loginRequest.model.js';
import { LoginLog } from '../models/loginLog.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { realtimeService } from '../services/socket.service.js';
import { Vendor } from '../models/vendor.model.js';
import { parseUserAgent } from '../utils/deviceInfo.js';
import otpService from '../services/otp.service.js';

/**
 * [SHARED] & [WEB] User Controller
 * Handles authentication, approvals, subusers, RBAC, and real-time SSE.
 * - [SHARED]: Core login, guest access, login approval polling, profile, user/subuser CRUD.
 * - [WEB]: logoutUser, getOnlineUsers, streamRealtimeEvents.
 */

/**
 * [SHARED] generateUserToken - Issue signed JWT containing user ID, role, and store assignments
 */
const generateUserToken = (user) => {
    return jwt.sign(
        { 
            id: user._id, 
            email: user.email || user.contactEmail, 
            role: user.role || 'User', 
            name: user.name,
            isVendor: user.isVendor || false,
            projects: user.projects,
            stores: user.stores
        },
        env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

/**
 * [SHARED] createUser - Create a new system user with credentials and permissions (Admin only)
 */
const createUser = async (req, res, next) => {
    try {
        const existingEmail = await userService.getUserByEmail(req.body.email);
        if (existingEmail) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const user = await userService.createUser(req.body);
        const userObj = user.toObject();
        delete userObj.password;

        res.status(201).json({ success: true, data: userObj });
    } catch (error) {
        next(error);
    }
};

const getUsers = async (req, res, next) => {
    try {
        const users = await userService.getUsers(req.user);
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
};

const getUserById = async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.params.id, req.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        if (error.message && error.message.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const updateUser = async (req, res, next) => {
    try {
        const user = await userService.updateUser(req.params.id, req.body, req.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        await AuditLog.create({
            actor: req.user._id,
            action: 'UPDATE_USER',
            targetUser: user._id,
            details: { name: user.name, role: user.role }
        });
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        if (error.message && error.message.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const deleteUser = async (req, res, next) => {
    try {
        const user = await userService.deleteUser(req.params.id, req.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        await AuditLog.create({
            actor: req.user._id,
            action: 'DELETE_USER',
            targetUser: req.params.id,
            details: { name: user.name }
        });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        if (error.message && error.message.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

// Subuser Endpoints
const getSubusers = async (req, res, next) => {
    try {
        if (req.user.role !== 'Admin' && !req.user.canCreateUser) {
            return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage subusers.' });
        }
        const subusers = await userService.getSubusers(req.user);
        res.status(200).json({ success: true, data: subusers });
    } catch (error) {
        next(error);
    }
};

const createSubuser = async (req, res, next) => {
    try {
        if (req.user.role !== 'Admin' && !req.user.canCreateUser) {
            return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to create subusers.' });
        }
        const existingEmail = await userService.getUserByEmail(req.body.email);
        if (existingEmail) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const subuser = await userService.createSubuser(req.body, req.user);
        await AuditLog.create({
            actor: req.user._id,
            action: 'CREATE_SUBUSER',
            targetUser: subuser._id,
            details: { name: subuser.name, email: subuser.email, parentUser: subuser.parentUser }
        });

        res.status(201).json({ success: true, data: subuser });
    } catch (error) {
        if (error.message && error.message.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const updateSubuser = async (req, res, next) => {
    try {
        if (req.user.role !== 'Admin' && !req.user.canCreateUser) {
            return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to edit subusers.' });
        }
        const subuser = await userService.updateUser(req.params.id, req.body, req.user);
        if (!subuser) {
            return res.status(404).json({ success: false, message: 'Subuser not found' });
        }
        await AuditLog.create({
            actor: req.user._id,
            action: 'UPDATE_SUBUSER_PERMISSIONS',
            targetUser: subuser._id,
            details: { allowedPages: subuser.allowedPages, hasInspectionAccess: subuser.hasInspectionAccess }
        });
        res.status(200).json({ success: true, data: subuser });
    } catch (error) {
        if (error.message && error.message.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const deleteSubuser = async (req, res, next) => {
    try {
        if (req.user.role !== 'Admin' && !req.user.canCreateUser) {
            return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to delete subusers.' });
        }
        const user = await userService.deleteUser(req.params.id, req.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Subuser not found' });
        }
        await AuditLog.create({
            actor: req.user._id,
            action: 'DELETE_SUBUSER',
            targetUser: req.params.id,
            details: { name: user.name, email: user.email }
        });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        if (error.message && error.message.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getCurrentUser = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'Guest') {
            return res.status(200).json({
                success: true,
                data: {
                    _id: req.user._id || 'guest_user_id',
                    id: req.user.id || 'guest_user_id',
                    name: req.user.name || 'Guest User',
                    email: req.user.email || 'guest@lnt.com',
                    role: 'Guest',
                    user_id: 'GUEST-001',
                    allowedPages: ['/qr-scanner'],
                    projects: [],
                    stores: []
                }
            });
        }

        if (req.user && (req.user.isVendor || req.user.role === 'Vendor')) {
            const vendor = await Vendor.findById(req.user._id)
                .populate('projects', 'name code location')
                .populate('stores', 'name code siteName')
                .select('-password');
            if (vendor) {
                return res.status(200).json({
                    success: true,
                    data: {
                        _id: vendor._id,
                        id: vendor._id.toString(),
                        name: vendor.name,
                        email: vendor.contactEmail,
                        phonenumber: vendor.contactPhone,
                        role: 'Vendor',
                        isVendor: true,
                        vendorCode: vendor.vendorCode,
                        contactPerson: vendor.contactPerson,
                        gstNumber: vendor.gstNumber,
                        allowedPages: vendor.allowedPages || ['/projects', '/stores', '/tools'],
                        projects: vendor.projects || [],
                        stores: vendor.stores || []
                    }
                });
            }
        }
        const user = await userService.getUserById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User session expired' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

// [SHARED] Request OTP for Email-based authentication
const requestOtp = async (req, res, next) => {
    try {
        const clientIp = req.ip || req.socket.remoteAddress || '';
        const userAgentHeader = req.headers['user-agent'] || '';
        const result = await otpService.requestOtp(req.body.email, { ip: clientIp, userAgent: userAgentHeader });
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = error.status || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message,
            retryAfter: error.retryAfter
        });
    }
};

// [SHARED] Verify 6-digit OTP and issue JWT session
const verifyOtp = async (req, res, next) => {
    try {
        const clientIp = req.ip || req.socket.remoteAddress || '';
        const userAgentHeader = req.headers['user-agent'] || '';
        const result = await otpService.verifyOtp(req.body.email, req.body.otp, { ip: clientIp, userAgent: userAgentHeader });
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = error.status || 400;
        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

// User, Subuser & Vendor Login Flow (Supports Email OTP & Backward Compatibility)
const loginUser = async (req, res, next) => {
    try {
        const { email, password, otp } = req.body;
        const normalizedEmail = (email || '').trim().toLowerCase();
        const clientIp = req.ip || req.socket.remoteAddress || '';
        const userAgentHeader = req.headers['user-agent'] || '';
        const deviceInfo = parseUserAgent(userAgentHeader);

        // If OTP provided, verify OTP directly
        if (otp) {
            const result = await otpService.verifyOtp(normalizedEmail, otp, { ip: clientIp, userAgent: userAgentHeader });
            return res.status(200).json(result);
        }

        // If no password provided, trigger OTP request
        if (!password) {
            const result = await otpService.requestOtp(normalizedEmail, { ip: clientIp, userAgent: userAgentHeader });
            return res.status(200).json(result);
        }

        // 1. First check User collection for internal team members and subusers
        const user = await userService.getUserByEmail(normalizedEmail);
        if (!user) {
            // 2. Fallback check Vendor collection for Vendor logins
            const vendor = await Vendor.findOne({
                $or: [
                    { contactEmail: normalizedEmail },
                    { email: normalizedEmail }
                ]
            });

            if (vendor) {
                if (vendor.status === 'Inactive') {
                    await LoginLog.create({
                        user: vendor._id,
                        userName: vendor.name,
                        userEmail: vendor.contactEmail,
                        role: 'Vendor',
                        status: 'Failed',
                        rejectionReason: 'Vendor account inactive',
                        ipAddress: clientIp,
                        userAgent: userAgentHeader,
                        deviceInfo
                    });
                    return res.status(403).json({ success: false, message: 'Vendor account is inactive. Please contact administrator.' });
                }
                const isVendorMatch = await vendor.comparePassword(password);
                if (!isVendorMatch) {
                    await LoginLog.create({
                        user: vendor._id,
                        userName: vendor.name,
                        userEmail: vendor.contactEmail,
                        role: 'Vendor',
                        status: 'Failed',
                        rejectionReason: 'Invalid password',
                        ipAddress: clientIp,
                        userAgent: userAgentHeader,
                        deviceInfo
                    });
                    return res.status(401).json({ success: false, message: 'Invalid email or password' });
                }

                const token = generateUserToken({
                    _id: vendor._id,
                    email: vendor.contactEmail,
                    role: 'Vendor',
                    name: vendor.name,
                    isVendor: true
                });

                const vendorObj = {
                    _id: vendor._id,
                    name: vendor.name,
                    email: vendor.contactEmail,
                    role: 'Vendor',
                    isVendor: true,
                    vendorCode: vendor.vendorCode,
                    contactPerson: vendor.contactPerson,
                    allowedPages: ['/projects', '/stores', '/tools']
                };

                await LoginLog.create({
                    user: vendor._id,
                    userName: vendor.name,
                    userEmail: vendor.contactEmail,
                    role: 'Vendor',
                    status: 'Success',
                    ipAddress: clientIp,
                    userAgent: userAgentHeader,
                    deviceInfo
                });

                return res.status(200).json({
                    success: true,
                    token,
                    user: vendorObj
                });
            }

            // Unknown account attempt
            await LoginLog.create({
                userName: normalizedEmail,
                userEmail: normalizedEmail,
                role: 'Unknown',
                status: 'Failed',
                rejectionReason: 'User not found',
                ipAddress: clientIp,
                userAgent: userAgentHeader,
                deviceInfo
            });

            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            await LoginLog.create({
                user: user._id,
                userName: user.name,
                userEmail: user.email,
                role: user.role || 'User',
                parentUser: user.parentUser || null,
                status: 'Failed',
                rejectionReason: 'Invalid password',
                ipAddress: clientIp,
                userAgent: userAgentHeader,
                deviceInfo
            });
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // If Admin, log in directly
        if (user.role === 'Admin') {
            const token = generateUserToken(user);
            const userObj = user.toObject();
            delete userObj.password;

            await LoginLog.create({
                user: user._id,
                userName: user.name,
                userEmail: user.email,
                role: 'Admin',
                status: 'Success',
                ipAddress: clientIp,
                userAgent: userAgentHeader,
                deviceInfo
            });

            return res.status(200).json({
                success: true,
                token,
                user: userObj
            });
        }

        // Check if active PENDING request exists within last 10 minutes
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const existingPending = await LoginRequest.findOne({
            user: user._id,
            status: 'PENDING',
            requestedAt: { $gte: tenMinutesAgo }
        });

        if (existingPending) {
            return res.status(409).json({
                success: false,
                message: user.role === 'Subuser'
                    ? 'Login request sent. Waiting for parent user approval.'
                    : 'Login request sent. Waiting for administrator approval.',
                requestId: String(existingPending._id),
                data: {
                    requestId: String(existingPending._id),
                    userId: user._id,
                    email: user.email,
                    status: 'PENDING'
                }
            });
        }

        // Parent User Resolution for Subuser
        let parentUserName = null;
        if (user.role === 'Subuser' && user.parentUser) {
            const parent = await User.findById(user.parentUser);
            parentUserName = parent?.name || null;
        }

        // Create new PENDING LoginRequest
        const loginReq = await LoginRequest.create({
            user: user._id,
            userName: user.name,
            userEmail: user.email,
            parentUser: user.parentUser || null,
            status: 'PENDING',
            ipAddress: clientIp,
            userAgent: userAgentHeader
        });

        // Record in LoginLog
        await LoginLog.create({
            user: user._id,
            userName: user.name,
            userEmail: user.email,
            role: user.role || 'User',
            parentUser: user.parentUser || null,
            parentUserName,
            status: 'Pending Approval',
            ipAddress: clientIp,
            userAgent: userAgentHeader,
            deviceInfo,
            requestId: String(loginReq._id)
        });

        const requestPayload = {
            id: String(loginReq._id),
            user_id: user._id,
            user_name: user.name,
            user_email: user.email,
            role: user.role || 'User',
            parent_id: user.parentUser ? String(user.parentUser) : null,
            parent_name: parentUserName,
            status: 'PENDING',
            requested_at: loginReq.requestedAt
        };

        // Notify Parent User if Subuser; also notify Admins
        if (user.role === 'Subuser' && user.parentUser) {
            realtimeService.notifyUser(String(user.parentUser), 'new_login_request', requestPayload);
        }
        realtimeService.notifyAdmins('new_login_request', requestPayload);

        res.status(202).json({
            success: true,
            message: user.role === 'Subuser'
                ? 'Login request sent. Waiting for parent user approval.'
                : 'Login request sent. Waiting for administrator approval.',
            requestId: String(loginReq._id),
            data: {
                requestId: String(loginReq._id),
                userId: user._id,
                email: user.email,
                status: 'PENDING'
            }
        });
    } catch (error) {
        next(error);
    }
};

// Check Login Request Status (Polling or initial check)
const checkLoginRequestStatus = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const loginReq = await LoginRequest.findById(requestId).populate('user');

        if (!loginReq) {
            return res.status(404).json({ success: false, message: 'Login request not found' });
        }

        if (loginReq.status === 'APPROVED') {
            const token = generateUserToken(loginReq.user);
            const userObj = loginReq.user.toObject();
            delete userObj.password;

            return res.status(200).json({
                success: true,
                status: 'APPROVED',
                token,
                user: userObj
            });
        }

        res.status(200).json({
            success: true,
            status: loginReq.status,
            reason: loginReq.rejectionReason || ''
        });
    } catch (error) {
        next(error);
    }
};

// Get Pending Login Requests (Admin sees all; Parent User sees their subusers)
const getPendingLoginRequests = async (req, res, next) => {
    try {
        const filter = { status: 'PENDING' };
        if (req.user.role !== 'Admin') {
            // Parent users can only see pending requests for their subusers
            filter.parentUser = req.user._id;
        }

        const pending = await LoginRequest.find(filter)
            .sort({ requestedAt: -1 })
            .populate('user', 'name email role parentUser')
            .populate('parentUser', 'name email');

        const formatted = pending.map(r => ({
            id: String(r._id),
            user_id: r.user?._id || r.user,
            user_name: r.userName,
            user_email: r.userEmail,
            role: r.user?.role || 'User',
            parent_id: r.parentUser?._id || r.parentUser,
            parent_name: r.parentUser?.name || null,
            status: r.status,
            requested_at: r.requestedAt,
            ip_address: r.ipAddress
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        next(error);
    }
};

// Approve Login Request (Admin or Parent User)
const approveLoginRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const loginReq = await LoginRequest.findById(requestId).populate('user');

        if (!loginReq || loginReq.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: 'Pending login request not found' });
        }

        // Authorization check: Admin OR parent user of this subuser
        const isParent = loginReq.parentUser && String(loginReq.parentUser) === String(req.user._id);
        if (req.user.role !== 'Admin' && !isParent) {
            return res.status(403).json({ success: false, message: 'Access denied. You can only approve login requests for your own subusers.' });
        }

        loginReq.status = 'APPROVED';
        loginReq.approvedAt = new Date();
        loginReq.approvedBy = req.user._id;
        await loginReq.save();

        // Update persistent LoginLog
        await LoginLog.findOneAndUpdate(
            { requestId: String(loginReq._id) },
            {
                status: 'Approved',
                approvedBy: req.user._id,
                approverName: req.user.name,
                approvedAt: new Date()
            }
        );

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            action: 'APPROVE_LOGIN',
            targetRequestId: String(loginReq._id),
            targetUser: loginReq.user._id,
            details: { approvedByRole: req.user.role, isParentApproval: Boolean(isParent) }
        });

        // Issue JWT token
        const token = generateUserToken(loginReq.user);
        const userObj = loginReq.user.toObject();
        delete userObj.password;

        const payload = {
            status: 'APPROVED',
            token,
            user: userObj
        };

        // Notify user via Socket/SSE
        realtimeService.notifyRequest(String(loginReq._id), 'login_approved', payload);

        res.status(200).json({ success: true, message: 'Login request approved' });
    } catch (error) {
        next(error);
    }
};

// Reject Login Request (Admin or Parent User)
const rejectLoginRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;

        const loginReq = await LoginRequest.findById(requestId);
        if (!loginReq || loginReq.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: 'Pending login request not found' });
        }

        // Authorization check: Admin OR parent user of this subuser
        const isParent = loginReq.parentUser && String(loginReq.parentUser) === String(req.user._id);
        if (req.user.role !== 'Admin' && !isParent) {
            return res.status(403).json({ success: false, message: 'Access denied. You can only reject login requests for your own subusers.' });
        }

        loginReq.status = 'REJECTED';
        loginReq.approvedAt = new Date();
        loginReq.approvedBy = req.user._id;
        loginReq.rejectionReason = reason || (isParent ? 'Rejected by parent user' : 'Rejected by administrator');
        await loginReq.save();

        // Update persistent LoginLog
        await LoginLog.findOneAndUpdate(
            { requestId: String(loginReq._id) },
            {
                status: 'Rejected',
                approvedBy: req.user._id,
                approverName: req.user.name,
                approvedAt: new Date(),
                rejectionReason: loginReq.rejectionReason
            }
        );

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            action: 'REJECT_LOGIN',
            targetRequestId: String(loginReq._id),
            targetUser: loginReq.user,
            details: { reason: loginReq.rejectionReason, rejectedByRole: req.user.role, isParentRejection: Boolean(isParent) }
        });

        // Notify user via Socket/SSE
        realtimeService.notifyRequest(String(loginReq._id), 'login_rejected', {
            status: 'REJECTED',
            reason: loginReq.rejectionReason
        });

        res.status(200).json({ success: true, message: 'Login request rejected' });
    } catch (error) {
        next(error);
    }
};

// User Logout (tracks session duration)
const logoutUser = async (req, res, next) => {
    try {
        if (req.user && req.user._id) {
            const latestLog = await LoginLog.findOne({
                user: req.user._id,
                status: { $in: ['Success', 'Approved'] },
                logoutAt: null
            }).sort({ loginAt: -1 });

            if (latestLog) {
                const now = new Date();
                latestLog.logoutAt = now;
                latestLog.sessionDuration = Math.max(0, Math.round((now.getTime() - new Date(latestLog.loginAt).getTime()) / 1000));
                await latestLog.save();
            }
        }
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

// Admin: Get Currently Online Users
const getOnlineUsers = async (req, res, next) => {
    try {
        const onlineIds = realtimeService.getOnlineUserIds();
        res.status(200).json({ success: true, data: { count: onlineIds.length, userIds: onlineIds } });
    } catch (error) {
        next(error);
    }
};

// Realtime Events SSE Handler
const streamRealtimeEvents = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user = req.user || null;

    realtimeService.addClient(clientId, res, user);

    // Initial heartbeat
    res.write(`data: ${JSON.stringify({ event: 'connected', data: { clientId } })}\n\n`);
};

// Guest Login Handler
const guestLogin = async (req, res, next) => {
    try {
        const guestUserPayload = {
            _id: 'guest_' + Date.now(),
            id: 'guest_user_id',
            name: 'Guest User',
            email: 'guest@lnt.com',
            role: 'Guest',
            user_id: 'GUEST-001',
            allowedPages: ['/qr-scanner']
        };

        const token = generateUserToken(guestUserPayload);

        // Record guest login
        await LoginLog.create({
            userName: 'Guest User',
            userEmail: 'guest@lnt.com',
            role: 'Guest',
            status: 'Success',
            ipAddress: req.ip || '',
            userAgent: req.headers['user-agent'] || '',
            deviceInfo: parseUserAgent(req.headers['user-agent'])
        });

        return res.status(200).json({
            success: true,
            token,
            user: guestUserPayload
        });
    } catch (error) {
        next(error);
    }
};

export const userController = {
    // [SHARED] Core User Management
    createUser,
    createSubuser,
    getUsers,
    getSubusers,
    getUserById,
    updateUser,
    updateSubuser,
    deleteUser,
    deleteSubuser,
    getCurrentUser,

    // [SHARED] Authentication & Multi-Device Approvals
    loginUser,
    requestOtp,
    verifyOtp,
    guestLogin,
    checkLoginRequestStatus,
    getPendingLoginRequests,
    approveLoginRequest,
    rejectLoginRequest,

    // [WEB] Web Exclusive Session & Realtime Features
    logoutUser,
    getOnlineUsers,
    streamRealtimeEvents
};

