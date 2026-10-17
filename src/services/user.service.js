import { User } from '../models/user.model.js';

const enforcePagePermissions = (data, existingRole = 'User') => {
    const role = data.role || existingRole;
    if (role === 'Admin') {
        data.allowedPages = ['/dashboard', '/projects', '/stores', '/tools', '/users', '/settings'];
        data.hasInspectionAccess = true;
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
        .populate('stores', 'name code siteName')
        .populate('parentUser', 'name email user_id');
};

const createSubuser = async (subuserData, actor) => {
    const parentUser = actor.role === 'Admin' && subuserData.parentUser
        ? await User.findById(subuserData.parentUser)
        : await User.findById(actor._id);

    if (!parentUser) {
        throw new Error('Parent user account not found.');
    }

    if (actor.role !== 'Admin' && !parentUser.canCreateUser) {
        throw new Error('User does not have permission to create subusers.');
    }

    const data = { ...subuserData };
    data.role = 'Subuser';
    data.parentUser = parentUser._id;
    data.canCreateUser = false; // Subusers can never create users

    // Enforce hierarchy: subuser permissions must be a subset of parent permissions
    if (parentUser.role !== 'Admin') {
        const parentPages = parentUser.allowedPages || [];
        data.allowedPages = (data.allowedPages || []).filter(p => parentPages.includes(p));

        const parentProjIds = (parentUser.projects || []).map(p => String(p._id || p));
        data.projects = (data.projects || []).filter(p => parentProjIds.includes(String(p)));

        const parentStoreIds = (parentUser.stores || []).map(s => String(s._id || s));
        data.stores = (data.stores || []).filter(s => parentStoreIds.includes(String(s)));

        data.hasInspectionAccess = Boolean(data.hasInspectionAccess && parentUser.hasInspectionAccess);
    }

    const user = new User(data);
    await user.save();

    return await User.findById(user._id)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .populate('parentUser', 'name email user_id')
        .select('-__v -password');
};

const getUsers = async (actor = null) => {
    const filter = {};
    if (actor && actor.role !== 'Admin') {
        // Data isolation: non-admin users only see subusers created by them
        filter.parentUser = actor._id;
    }

    return await User.find(filter)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .populate('parentUser', 'name email user_id')
        .select('-__v -password')
        .sort({ createdAt: -1 });
};

const getSubusers = async (actor) => {
    const filter = { role: 'Subuser' };
    if (actor && actor.role !== 'Admin') {
        // Enforce data isolation: regular users only see their own subusers
        filter.parentUser = actor._id;
    }

    return await User.find(filter)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .populate('parentUser', 'name email user_id')
        .select('-__v -password')
        .sort({ createdAt: -1 });
};

const getUserById = async (id, actor = null) => {
    const user = await User.findById(id)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .populate('parentUser', 'name email user_id')
        .select('-__v -password');

    if (!user) return null;

    // Enforce data isolation if actor is non-admin and viewing another user's subuser
    if (actor && actor.role !== 'Admin' && user.role === 'Subuser') {
        const parentId = user.parentUser?._id || user.parentUser;
        if (String(parentId) !== String(actor._id) && String(user._id) !== String(actor._id)) {
            throw new Error('Access denied. You do not have permission to view this subuser.');
        }
    }

    return user;
};

const getUserByEmail = async (email) => {
    return await User.findOne({ email })
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .populate('parentUser', 'name email user_id');
};

const updateUser = async (id, updateData, actor = null) => {
    const data = { ...updateData };
    if (data.password && data.password.trim() === '') {
        delete data.password;
    }
    const user = await User.findById(id);
    if (!user) return null;

    // Enforce data isolation if editing a subuser
    if (user.role === 'Subuser') {
        if (actor && actor.role !== 'Admin' && String(user.parentUser) !== String(actor._id)) {
            throw new Error('Access denied. You can only manage subusers created under your account.');
        }
        // Subusers can never have canCreateUser or Admin role
        data.canCreateUser = false;
        data.role = 'Subuser';

        // Check parent permissions for clamping
        const parent = await User.findById(user.parentUser);
        if (parent && parent.role !== 'Admin') {
            if (data.allowedPages) {
                data.allowedPages = data.allowedPages.filter(p => (parent.allowedPages || []).includes(p));
            }
            if (data.projects) {
                const parentProjIds = (parent.projects || []).map(p => String(p._id || p));
                data.projects = data.projects.filter(p => parentProjIds.includes(String(p)));
            }
            if (data.stores) {
                const parentStoreIds = (parent.stores || []).map(s => String(s._id || s));
                data.stores = data.stores.filter(s => parentStoreIds.includes(String(s)));
            }
            if (data.hasInspectionAccess !== undefined) {
                data.hasInspectionAccess = Boolean(data.hasInspectionAccess && parent.hasInspectionAccess);
            }
        }
    }

    enforcePagePermissions(data, user.role);
    Object.assign(user, data);
    await user.save();

    // Cascading update: If parent user's permissions were reduced, clamp child subusers
    if (user.role !== 'Admin') {
        const childSubusers = await User.find({ parentUser: user._id });
        for (const child of childSubusers) {
            let childModified = false;
            const parentPages = user.allowedPages || [];
            const prunedPages = (child.allowedPages || []).filter(p => parentPages.includes(p));
            if (prunedPages.length !== (child.allowedPages || []).length) {
                child.allowedPages = prunedPages;
                childModified = true;
            }

            const parentProjIds = (user.projects || []).map(p => String(p._id || p));
            const prunedProjs = (child.projects || []).filter(p => parentProjIds.includes(String(p)));
            if (prunedProjs.length !== (child.projects || []).length) {
                child.projects = prunedProjs;
                childModified = true;
            }

            const parentStoreIds = (user.stores || []).map(s => String(s._id || s));
            const prunedStores = (child.stores || []).filter(s => parentStoreIds.includes(String(s)));
            if (prunedStores.length !== (child.stores || []).length) {
                child.stores = prunedStores;
                childModified = true;
            }

            if (!user.hasInspectionAccess && child.hasInspectionAccess) {
                child.hasInspectionAccess = false;
                childModified = true;
            }

            if (childModified) {
                await child.save();
            }
        }
    }

    return await User.findById(user._id)
        .populate('projects', 'name code location')
        .populate('stores', 'name code siteName')
        .populate('parentUser', 'name email user_id')
        .select('-__v -password');
};

const deleteUser = async (id, actor = null) => {
    const user = await User.findById(id);
    if (!user) return null;

    if (actor && actor.role !== 'Admin') {
        if (user.role === 'Subuser' && String(user.parentUser) !== String(actor._id)) {
            throw new Error('Access denied. You can only delete your own subusers.');
        }
    }

    // If deleting a parent user, cascade delete or unlink child subusers
    await User.deleteMany({ parentUser: id });

    return await User.findByIdAndDelete(id);
};

export const userService = {
    createUser,
    createSubuser,
    getUsers,
    getSubusers,
    getUserById,
    getUserByEmail,
    updateUser,
    deleteUser
};

