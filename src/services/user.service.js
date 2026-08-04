import { User } from '../models/user.model.js';

const enforcePagePermissions = (data, existingRole = 'User') => {
    const role = data.role || existingRole;
    if (role === 'Admin') {
        data.allowedPages = ['/dashboard', '/projects', '/stores', '/tools', '/users', '/settings'];
        return;
    }
    if (role === 'Vendor') {
        data.allowedPages = ['/stores', '/tools'];
        return;
    }
    if (data.projects && Array.isArray(data.projects) && data.projects.length > 0) {
        if (!data.allowedPages) data.allowedPages = [];
        if (!data.allowedPages.includes('/projects')) {
            data.allowedPages.push('/projects');
        }
    }
    if (data.stores && Array.isArray(data.stores) && data.stores.length > 0) {
        if (!data.allowedPages) data.allowedPages = [];
        if (!data.allowedPages.includes('/stores')) {
            data.allowedPages.push('/stores');
        }
        if (!data.allowedPages.includes('/tools')) {
            data.allowedPages.push('/tools');
        }
    }
};

const createUser = async (userData) => {
    enforcePagePermissions(userData, userData.role || 'User');
    const user = new User(userData);
    await user.save();
    return await User.findById(user._id)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName');
};

const getUsers = async () => {
    return await User.find()
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .select('-__v -password')
        .sort({ createdAt: -1 });
};

const getUserById = async (id) => {
    return await User.findById(id)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .select('-__v -password');
};

const getUserByEmail = async (email) => {
    return await User.findOne({ email })
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName');
};

const updateUser = async (id, updateData) => {
    const data = { ...updateData };
    if (data.password && data.password.trim() === '') {
        delete data.password;
    }
    const user = await User.findById(id);
    if (!user) return null;

    enforcePagePermissions(data, user.role);
    Object.assign(user, data);
    await user.save();

    return await User.findById(user._id)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .select('-__v -password');
};

const deleteUser = async (id) => {
    return await User.findByIdAndDelete(id);
};

export const userService = {
    createUser,
    getUsers,
    getUserById,
    getUserByEmail,
    updateUser,
    deleteUser
};
