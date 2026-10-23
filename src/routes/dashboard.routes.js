import express from 'express';
import { getDashboardStats, extendToolLife } from '../controllers/dashboard.controller.js';

const router = express.Router();

/**
 * [SHARED] Dashboard & Analytics Endpoints
 * Consumed by both Web Application and Mobile App:
 * - Web: client/src/services/dashboard.service.ts
 * - Mobile: larsentoubro-app/src/features/dashboard/services/dashboardService.ts
 */

/**
 * [SHARED] GET /api/dashboard/stats
 * Retrieves overview KPIs, tool status breakdowns, recent activity, and expiry warnings.
 */
router.get('/stats', getDashboardStats);

/**
 * [SHARED] POST /api/dashboard/tools/:toolId/extend-life
 * Extends expiration / validity life of a tool directly from dashboard alerts.
 */
router.post('/tools/:toolId/extend-life', extendToolLife);

export default router;
