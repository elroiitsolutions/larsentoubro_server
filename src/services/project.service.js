import { Project } from '../models/project.model.js';

const createProject = async (projectData) => {
    const data = { ...projectData };
    if (data.projectName) data.name = data.projectName;
    const project = new Project(data);
    await project.save();
    return project;
};

const getProjects = async (filter = {}) => {
    return await Project.find(filter).sort({ createdAt: -1 });
};

const getProjectById = async (id) => {
    return await Project.findById(id);
};

const updateProject = async (id, updateData) => {
    return await Project.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
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
