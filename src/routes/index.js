import { Router } from 'express';
import userRoutes from './user.routes.js';
import formRoutes from './form.routes.js';
import projectRoutes from './project.routes.js';
import storeRoutes from './store.routes.js';
import toolRoutes from './tool.routes.js';
import vendorRoutes from './vendor.routes.js';
import challanRoutes from './challan.routes.js';
import reportRoutes from './report.routes.js';
import { attachUser } from '../middleware/auth.middleware.js';

const router = Router();

// Globally attach req.user if JWT token is present in headers
router.use(attachUser);

router.use('/users', userRoutes);
router.use('/forms', formRoutes);
router.use('/projects', projectRoutes);
router.use('/stores', storeRoutes);
router.use('/tools', toolRoutes);
router.use('/vendors', vendorRoutes);
router.use('/challans', challanRoutes);
router.use('/reports', reportRoutes);

export default router;
