import express from 'express';
import { getDashboardStats, extendToolLife } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/stats', getDashboardStats);
router.post('/tools/:toolId/extend-life', extendToolLife);

export default router;
