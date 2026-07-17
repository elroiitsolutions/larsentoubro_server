import { User } from '../models/user.model.js';

const createUser = async (userData) => {
    const user = new User(userData);
    await user.save();
    return user;
};

const getUsers = async () => {
    return await User.find().select('-__v -password');
};

const getUserByEmail = async (email) => {
    return await User.findOne({ email });
};

export const userService = {
    createUser,
    getUsers,
    getUserByEmail
};
