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

/**
 * [SHARED] Project Management Routes
 * Consumed by both Web Application and Mobile App:
 * - Web: client/src/services/project.service.ts
 * - Mobile: larsentoubro-app/src/features/projects/services/projectService.ts
 */

router.use(authenticate, requirePagePermission("/projects"));

/**
 * [SHARED] POST /api/projects - Create a new project (Admin only)
 */
router.post('/', requireAdmin, createProject);

/**
 * [SHARED] GET /api/projects - List all projects
 */
router.get('/', getProjects);

/**
 * [SHARED] GET /api/projects/:id - Get project details by ID
 */
router.get('/:id', getProjectById);

/**
 * [SHARED] PUT /api/projects/:id - Update existing project (Admin only)
 */
router.put('/:id', requireAdmin, updateProject);

/**
 * [SHARED] DELETE /api/projects/:id - Delete project by ID (Admin only)
 */
router.delete('/:id', requireAdmin, deleteProject);

export default router;
