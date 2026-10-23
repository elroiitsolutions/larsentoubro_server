import { Router } from 'express';
import userRoutes from './user.routes.js';
import formRoutes from './form.routes.js';
import projectRoutes from './project.routes.js';
import storeRoutes from './store.routes.js';
import toolRoutes from './tool.routes.js';
import vendorRoutes from './vendor.routes.js';
import profileRoutes from './profile.routes.js';
import challanRoutes from './challan.routes.js';
import reportRoutes from './report.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import { attachUser, restrictGuestAccess } from '../middleware/auth.middleware.js';

const router = Router();

// Globally attach req.user if JWT token is present in headers
router.use(attachUser);
router.use(restrictGuestAccess);

/**
 * Route Module Registrations:
 * - /api/users      [SHARED] Core authentication, RBAC, subusers + [WEB] SSE & session events
 * - /api/forms      [SHARED] Dynamic form schemas and submissions
 * - /api/projects   [SHARED] Project register and management
 * - /api/stores     [SHARED] Store catalog, store tools + [WEB] Excel export & job streaming
 * - /api/tools      [SHARED] Inventory operations, QR inspection, trash/scrap + [APP] batch-get
 * - /api/vendors    [WEB] Subcontractor/vendor directory (Web management UI)
 * - /api/profiles   [SHARED] Profiles directory + [WEB] profile document attachments
 * - /api/challans   [SHARED] Delivery, Return & Scrap challans + [APP] challan cancellation
 * - /api/reports    [SHARED] Module registers, audits, and multi-format exports
 * - /api/dashboard  [SHARED] Summary KPIs, statistics, and tool life extension
 */
router.use('/users', userRoutes);
router.use('/forms', formRoutes);
router.use('/projects', projectRoutes);
router.use('/stores', storeRoutes);
router.use('/tools', toolRoutes);
router.use('/vendors', vendorRoutes);
router.use('/profiles', profileRoutes);
router.use('/challans', challanRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
