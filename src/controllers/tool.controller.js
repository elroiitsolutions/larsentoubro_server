import { toolService } from '../services/tool.service.js';

export const getStoreTools = async (req, res, next) => {
    try {
        const { storeId } = req.params;
        const result = await toolService.getTools(storeId, req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};
