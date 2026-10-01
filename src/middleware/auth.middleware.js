import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';
import { Vendor } from '../models/vendor.model.js';

const getGuestUser = (decoded = {}) => ({
    _id: decoded.id || 'guest_user_id',
    id: decoded.id || 'guest_user_id',
    name: decoded.name || 'Guest User',
    email: decoded.email || 'guest@lnt.com',
    role: 'Guest',
    user_id: 'GUEST-001',
    allowedPages: ['/qr-scanner']
});

export const attachUser = async (req, res, next) => {
    try {
        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (token) {
            const decoded = jwt.verify(token, env.JWT_SECRET);
            let user = null;

            if (decoded.role === 'Guest') {
                user = getGuestUser(decoded);
            } else if (mongoose.Types.ObjectId.isValid(decoded.id)) {
                user = await User.findById(decoded.id)
                    .populate('projects', 'name code location')
                    .populate('stores', 'name code siteName')
                    .select('-password');
            }

            if (!user && (decoded.role === 'Vendor' || decoded.isVendor) && mongoose.Types.ObjectId.isValid(decoded.id)) {
                const vendor = await Vendor.findById(decoded.id)
                    .populate('projects', 'name code location')
                    .populate('stores', 'name code siteName')
                    .select('-password');
                if (vendor) {
                    user = {
                        _id: vendor._id,
                        id: vendor._id.toString(),
                        name: vendor.name,
                        email: vendor.contactEmail || vendor.email || '',
                        phonenumber: vendor.contactPhone || '',
                        role: 'Vendor',
                        isVendor: true,
                        vendorCode: vendor.vendorCode,
                        contactPerson: vendor.contactPerson,
                        gstNumber: vendor.gstNumber,
                        allowedPages: vendor.allowedPages || ['/projects', '/stores', '/tools'],
                        projects: vendor.projects || [],
                        stores: vendor.stores || []
                    };
                }
            }

            if (user) {
                req.user = user;
            }
        }
    } catch (error) {
        // Token invalid or expired; proceed without req.user
    }
    next();
};

export const authenticate = async (req, res, next) => {
    try {
        if (req.user) {
            if (req.user.role === 'Guest') {
                const path = req.originalUrl.split('?')[0];
                const allowed = ['/api/users/me', '/api/tools/lookup-validity', '/api/users/guest-login'];
                const isAllowed = allowed.some(p => path === p || path.startsWith('/api/tools/lookup-validity'));
                if (!isAllowed) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied. Guest users are restricted to the QR Scanner tool lookup only.'
                    });
                }
            }
            return next();
        }

        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
        // Fallback: accept token from query param (needed for SSE/EventSource which can't set headers)
        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please log in.'
            });
        }

        const decoded = jwt.verify(token, env.JWT_SECRET);
        let user = null;

        if (decoded.role === 'Guest') {
            user = getGuestUser(decoded);
        } else if (mongoose.Types.ObjectId.isValid(decoded.id)) {
            user = await User.findById(decoded.id)
                .populate('projects', 'name code location')
                .populate('stores', 'name code siteName')
                .select('-password');
        }

        if (!user && (decoded.role === 'Vendor' || decoded.isVendor) && mongoose.Types.ObjectId.isValid(decoded.id)) {
            const vendor = await Vendor.findById(decoded.id)
                .populate('projects', 'name code location')
                .populate('stores', 'name code siteName')
                .select('-password');
            if (vendor) {
                user = {
                    _id: vendor._id,
                    id: vendor._id.toString(),
                    name: vendor.name,
                    email: vendor.contactEmail || vendor.email || '',
                    phonenumber: vendor.contactPhone || '',
                    role: 'Vendor',
                    isVendor: true,
                    vendorCode: vendor.vendorCode,
                    contactPerson: vendor.contactPerson,
                    gstNumber: vendor.gstNumber,
                    allowedPages: vendor.allowedPages || ['/projects', '/stores', '/tools'],
                    projects: vendor.projects || [],
                    stores: vendor.stores || []
                };
            }
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User session invalid or user no longer exists.'
            });
        }

        if (user.role === 'Guest') {
            const path = req.originalUrl.split('?')[0];
            const allowed = ['/api/users/me', '/api/tools/lookup-validity', '/api/users/guest-login'];
            const isAllowed = allowed.some(p => path === p || path.startsWith('/api/tools/lookup-validity'));
            if (!isAllowed) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Guest users are restricted to the QR Scanner tool lookup only.'
                });
            }
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token.'
        });
    }
};

export const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'Admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.'
        });
    }
    next();
};

export const restrictGuestAccess = (req, res, next) => {
    if (req.user && req.user.role === 'Guest') {
        const allowedPaths = [
            '/api/users/me',
            '/api/tools/lookup-validity',
            '/api/users/guest-login'
        ];
        const path = req.originalUrl.split('?')[0];
        const isAllowed = allowedPaths.some(p => path === p || path.startsWith('/api/tools/lookup-validity'));
        if (!isAllowed) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Guest users are restricted to the QR Scanner tool lookup only.'
            });
        }
    }
    next();
};

export const requirePagePermission = (pagePrefix) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        // Guest users are strictly restricted to /qr-scanner
        if (req.user.role === 'Guest') {
            if (pagePrefix === "/qr-scanner") {
                return next();
            }
            return res.status(403).json({
                success: false,
                message: "Access denied. Guest users are restricted to the QR Scanner page only."
            });
        }
        // Admin users have unrestricted access to all pages and features by default
        if (req.user.role === 'Admin') {
            return next();
        }
        // Vendor users have access to assigned Projects, Stores, and Tools (/projects, /stores, /tools)
        if (req.user.role === 'Vendor') {
            if (pagePrefix === "/projects" || pagePrefix === "/stores" || pagePrefix === "/tools") {
                return next();
            }
            return res.status(403).json({
                success: false,
                message: "Access denied. Vendor access is restricted to assigned Delivery Challan modules."
            });
        }
        // Normal users must have the pagePrefix in their allowedPages array
        const allowed = req.user.allowedPages || [];
        if (pagePrefix === "/stores" && (allowed.includes("/stores") || allowed.includes("/tools"))) {
            return next();
        }
        if (!allowed.includes(pagePrefix)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. You do not have permission to view or interact with ${pagePrefix}.`
            });
        }
        next();
    };
};
