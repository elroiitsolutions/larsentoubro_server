import { userService } from '../services/user.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { LoginRequest } from '../models/loginRequest.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { realtimeService } from '../services/socket.service.js';

const generateUserToken = (user) => {
    return jwt.sign(
        { 
            id: user._id, 
            email: user.email, 
            role: user.role, 
            name: user.name,
            projects: user.projects,
            stores: user.stores
        },
        env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

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
        const users = await userService.getUsers();
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
};

const getUserById = async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

const updateUser = async (req, res, next) => {
    try {
        const user = await userService.updateUser(req.params.id, req.body);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

const deleteUser = async (req, res, next) => {
    try {
        const user = await userService.deleteUser(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

const getCurrentUser = async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User session expired' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

// User Login Request flow
const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await userService.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // If Admin, log in directly
        if (user.role === 'Admin') {
            const token = generateUserToken(user);
            const userObj = user.toObject();
            delete userObj.password;

            return res.status(200).json({
                success: true,
                token,
                user: userObj
            });
        }

        // 1. Check if active PENDING request exists within last 10 minutes
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const existingPending = await LoginRequest.findOne({
            user: user._id,
            status: 'PENDING',
            requestedAt: { $gte: tenMinutesAgo }
        });

        if (existingPending) {
            return res.status(409).json({
                success: false,
                message: 'Login request sent. Waiting for administrator approval.',
                requestId: String(existingPending._id),
                data: {
                    requestId: String(existingPending._id),
                    userId: user._id,
                    email: user.email,
                    status: 'PENDING'
                }
            });
        }

        // 2. Create new PENDING LoginRequest
        const loginReq = await LoginRequest.create({
            user: user._id,
            userName: user.name,
            userEmail: user.email,
            status: 'PENDING',
            ipAddress: req.ip || req.socket.remoteAddress || '',
            userAgent: req.headers['user-agent'] || ''
        });

        const requestPayload = {
            id: String(loginReq._id),
            user_id: user._id,
            user_name: user.name,
            user_email: user.email,
            status: 'PENDING',
            requested_at: loginReq.requestedAt
        };

        // Notify Admins in real-time
        realtimeService.notifyAdmins('new_login_request', requestPayload);

        res.status(202).json({
            success: true,
            message: 'Login request sent. Waiting for administrator approval.',
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

// Admin: Get All Pending Login Requests
const getPendingLoginRequests = async (req, res, next) => {
    try {
        const pending = await LoginRequest.find({ status: 'PENDING' })
            .sort({ requestedAt: -1 })
            .populate('user', 'name email role');

        const formatted = pending.map(r => ({
            id: String(r._id),
            user_id: r.user?._id || r.user,
            user_name: r.userName,
            user_email: r.userEmail,
            status: r.status,
            requested_at: r.requestedAt,
            ip_address: r.ipAddress
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        next(error);
    }
};

// Admin: Approve Login Request
const approveLoginRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const loginReq = await LoginRequest.findById(requestId).populate('user');

        if (!loginReq || loginReq.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: 'Pending login request not found' });
        }

        loginReq.status = 'APPROVED';
        loginReq.approvedAt = new Date();
        loginReq.approvedBy = req.user._id;
        await loginReq.save();

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            action: 'APPROVE_LOGIN',
            targetRequestId: String(loginReq._id),
            targetUser: loginReq.user._id
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

// Admin: Reject Login Request
const rejectLoginRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;

        const loginReq = await LoginRequest.findById(requestId);
        if (!loginReq || loginReq.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: 'Pending login request not found' });
        }

        loginReq.status = 'REJECTED';
        loginReq.approvedAt = new Date();
        loginReq.approvedBy = req.user._id;
        loginReq.rejectionReason = reason || 'Rejected by administrator';
        await loginReq.save();

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            action: 'REJECT_LOGIN',
            targetRequestId: String(loginReq._id),
            targetUser: loginReq.user,
            details: { reason: loginReq.rejectionReason }
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

export const userController = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    getCurrentUser,
    loginUser,
    checkLoginRequestStatus,
    getPendingLoginRequests,
    approveLoginRequest,
    rejectLoginRequest,
    getOnlineUsers,
    streamRealtimeEvents
};

