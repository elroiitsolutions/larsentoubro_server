import { Router } from 'express';
import userRoutes from './user.routes.js';
import formRoutes from './form.routes.js';
import projectRoutes from './project.routes.js';
import storeRoutes from './store.routes.js';
import toolRoutes from './tool.routes.js';

const router = Router();

router.use('/users', userRoutes);
router.use('/forms', formRoutes);
router.use('/projects', projectRoutes);
router.use('/stores', storeRoutes);
router.use('/stores', toolRoutes);

export default router;
