import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';

export const attachUser = async (req, res, next) => {
    try {
        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (token) {
            const decoded = jwt.verify(token, env.JWT_SECRET);
            const user = await User.findById(decoded.id)
                .populate('projects', 'name code location')
                .populate('stores', 'name code siteName')
                .select('-password');
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
            return next();
        }

        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please log in.'
            });
        }

        const decoded = jwt.verify(token, env.JWT_SECRET);
        const user = await User.findById(decoded.id)
            .populate('projects', 'name code location')
            .populate('stores', 'name code siteName')
            .select('-password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User session invalid or user no longer exists.'
            });
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

export const requirePagePermission = (pagePrefix) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        // Admin users have unrestricted access to all pages and features by default
        if (req.user.role === 'Admin') {
            return next();
        }
        // Vendor users only have access to tool issue and return operations (/stores, /tools)
        if (req.user.role === 'Vendor') {
            if (pagePrefix === "/stores" || pagePrefix === "/tools") {
                return next();
            }
            return res.status(403).json({
                success: false,
                message: "Access denied. Vendors only have access to tool issue and return operations."
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
