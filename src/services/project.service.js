import { Project } from '../models/project.model.js';

/**
 * [SHARED] Project Service
 * Business logic and database operations for Project management.
 * Consumed by both Web Application (project.service.ts) and Mobile App (projectService.ts).
 */

const createProject = async (projectData) => {
    const data = { ...projectData };
    delete data._id;
    if (data.projectName && !data.name) data.name = data.projectName;
    if (data.name && !data.projectName) data.projectName = data.name;
    if (data.projectCode && !data.code) data.code = data.projectCode;
    if (data.code && !data.projectCode) data.projectCode = data.code;
    const project = new Project(data);
    await project.save();
    return project;
};

const getProjects = async (filter = {}) => {
    const projects = await Project.find(filter).sort({ createdAt: -1 });
    return projects.map((p) => {
        const obj = p.toObject ? p.toObject() : p;
        if (obj.name && !obj.projectName) obj.projectName = obj.name;
        if (obj.projectName && !obj.name) obj.name = obj.projectName;
        if (obj.code && !obj.projectCode) obj.projectCode = obj.code;
        if (obj.projectCode && !obj.code) obj.code = obj.projectCode;
        return obj;
    });
};

const getProjectById = async (id) => {
    const project = await Project.findById(id);
    if (!project) return null;
    const obj = project.toObject ? project.toObject() : project;
    if (obj.name && !obj.projectName) obj.projectName = obj.name;
    if (obj.projectName && !obj.name) obj.name = obj.projectName;
    if (obj.code && !obj.projectCode) obj.projectCode = obj.code;
    if (obj.projectCode && !obj.code) obj.code = obj.projectCode;
    return obj;
};

const updateProject = async (id, updateData) => {
    const data = { ...updateData };
    delete data._id;
    delete data.__v;
    delete data.createdAt;
    delete data.updatedAt;
    if (data.projectName && !data.name) data.name = data.projectName;
    if (data.name && !data.projectName) data.projectName = data.name;
    if (data.projectCode && !data.code) data.code = data.projectCode;
    if (data.code && !data.projectCode) data.projectCode = data.code;
    return await Project.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
};

const deleteProject = async (id) => {
    return await Project.findByIdAndDelete(id);
};

export const projectService = {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
};
