import { userService } from '../services/user.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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

        // Generate JWT token with RBAC info
        const token = jwt.sign(
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

        const userObj = user.toObject();
        delete userObj.password;

        res.status(200).json({
            success: true,
            token,
            user: userObj
        });
    } catch (error) {
        next(error);
    }
};

export const userController = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    getCurrentUser,
    loginUser
};
