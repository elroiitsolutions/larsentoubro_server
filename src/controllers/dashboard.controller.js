import dashboardService from '../services/dashboard.service.js';

export const getDashboardStats = async (req, res, next) => {
    try {
        const stats = await dashboardService.getDashboardStats(req.query);
        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
};

export const extendToolLife = async (req, res, next) => {
    try {
        const { toolId } = req.params;
        const result = await dashboardService.extendToolLife(toolId, req.body);
        res.status(200).json({
            success: true,
            message: `Tool life successfully extended by ${req.body.extensionYears || 1} year(s)`,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export default {
    getDashboardStats,
    extendToolLife
};
