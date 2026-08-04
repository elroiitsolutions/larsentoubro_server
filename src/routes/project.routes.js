import express from 'express';
import {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
} from '../controllers/project.controller.js';
import { authenticate, requirePagePermission } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate, requirePagePermission("/projects"));

router.post('/', createProject);
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
