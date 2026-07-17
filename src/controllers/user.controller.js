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

        // Remove password from response
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

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role, name: user.name },
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
    loginUser
};
