import { projectService } from '../services/project.service.js';

export const createProject = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Only Admins can create projects.' });
        }
        const project = await projectService.createProject(req.body);
        res.status(201).json({ success: true, data: project });
    } catch (error) {
        next(error);
    }
};

export const getProjects = async (req, res, next) => {
    try {
        let filter = {};
        if (req.user && req.user.role !== 'Admin') {
            const assignedProjectIds = (req.user.projects || []).map(p => (p._id || p).toString());
            filter._id = { $in: assignedProjectIds };
        }
        const projects = await projectService.getProjects(filter);
        res.status(200).json({ success: true, data: projects });
    } catch (error) {
        next(error);
    }
};

export const getProjectById = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin') {
            const assignedProjectIds = (req.user.projects || []).map(p => (p._id || p).toString());
            if (!assignedProjectIds.includes(req.params.id.toString())) {
                return res.status(403).json({ success: false, message: 'Access denied. You are not assigned to this project.' });
            }
        }
        const project = await projectService.getProjectById(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        res.status(200).json({ success: true, data: project });
    } catch (error) {
        next(error);
    }
};

export const updateProject = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Only Admins can modify projects.' });
        }
        const project = await projectService.updateProject(req.params.id, req.body);
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        res.status(200).json({ success: true, data: project });
    } catch (error) {
        next(error);
    }
};

export const deleteProject = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Only Admins can delete projects.' });
        }
        const project = await projectService.deleteProject(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
