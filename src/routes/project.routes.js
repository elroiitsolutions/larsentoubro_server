import express from 'express';
import {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
} from '../controllers/project.controller.js';
import { authenticate, requirePagePermission, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate, requirePagePermission("/projects"));

router.post('/', requireAdmin, createProject);
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.put('/:id', requireAdmin, updateProject);
router.delete('/:id', requireAdmin, deleteProject);

export default router;
