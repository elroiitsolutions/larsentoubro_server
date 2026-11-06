import guestUserService from '../services/guestUser.service.js';

/**
 * Controller for Guest User Management
 */

export const createGuestUser = async (req, res, next) => {
    try {
        const guestUser = await guestUserService.createGuestUser(req.body, req.user);
        res.status(201).json({
            success: true,
            message: 'Guest user created successfully with 15-day access.',
            data: guestUser
        });
    } catch (error) {
        next(error);
    }
};

export const getGuestUsers = async (req, res, next) => {
    try {
        const guestUsers = await guestUserService.getGuestUsers(req.query, req.user);
        res.status(200).json({
            success: true,
            data: guestUsers
        });
    } catch (error) {
        next(error);
    }
};

export const getGuestUserById = async (req, res, next) => {
    try {
        const guestUser = await guestUserService.getGuestUserById(req.params.id);
        res.status(200).json({
            success: true,
            data: guestUser
        });
    } catch (error) {
        next(error);
    }
};

export const updateGuestUser = async (req, res, next) => {
    try {
        const updated = await guestUserService.updateGuestUser(req.params.id, req.body, req.user);
        res.status(200).json({
            success: true,
            message: 'Guest user updated successfully.',
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

export const extendGuestUser = async (req, res, next) => {
    try {
        const { duration, customDate } = req.body;
        if (!duration && !customDate) {
            return res.status(400).json({
                success: false,
                message: 'Duration or customDate is required.'
            });
        }
        const extended = await guestUserService.extendGuestUserAccess(req.params.id, duration, req.user, customDate);
        res.status(200).json({
            success: true,
            message: `Guest account access extended successfully.`,
            data: extended
        });
    } catch (error) {
        next(error);
    }
};

export const rejectGuestUser = async (req, res, next) => {
    try {
        const { reason } = req.body;
        const rejected = await guestUserService.rejectGuestUserExtension(req.params.id, reason, req.user);
        res.status(200).json({
            success: true,
            message: 'Guest extension request rejected. Account is now expired.',
            data: rejected
        });
    } catch (error) {
        next(error);
    }
};

export const getExpiringNotifications = async (req, res, next) => {
    try {
        const notifications = await guestUserService.getExpiringGuestNotifications(req.user);
        res.status(200).json({
            success: true,
            data: notifications
        });
    } catch (error) {
        next(error);
    }
};

export const deleteGuestUser = async (req, res, next) => {
    try {
        await guestUserService.deleteGuestUser(req.params.id, req.user);
        res.status(200).json({
            success: true,
            message: 'Guest user deleted successfully.'
        });
    } catch (error) {
        next(error);
    }
};

export default {
    createGuestUser,
    getGuestUsers,
    getGuestUserById,
    updateGuestUser,
    deleteGuestUser,
    extendGuestUser,
    rejectGuestUser,
    getExpiringNotifications
};

