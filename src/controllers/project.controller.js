import { projectService } from '../services/project.service.js';

export const createProject = async (req, res, next) => {
    try {
        const project = await projectService.createProject(req.body);
        res.status(201).json({ success: true, data: project });
    } catch (error) {
        next(error);
    }
};

export const getProjects = async (req, res, next) => {
    try {
        const projects = await projectService.getProjects();
        res.status(200).json({ success: true, data: projects });
    } catch (error) {
        next(error);
    }
};

export const getProjectById = async (req, res, next) => {
    try {
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
        const project = await projectService.deleteProject(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
