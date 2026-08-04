import * as challanService from '../services/challan.service.js';

export const createDeliveryChallan = async (req, res, next) => {
    try {
        const challan = await challanService.createDeliveryChallan(req.body, req.user || {});
        res.status(201).json({ success: true, data: challan, message: 'Delivery Challan created successfully' });
    } catch (error) {
        next(error);
    }
};

export const createReturnChallan = async (req, res, next) => {
    try {
        const challan = await challanService.createReturnChallan(req.body, req.user || {});
        res.status(201).json({ success: true, data: challan, message: 'Return Challan created successfully' });
    } catch (error) {
        next(error);
    }
};

export const getChallans = async (req, res, next) => {
    try {
        const result = await challanService.getChallans(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getChallanById = async (req, res, next) => {
    try {
        const challan = await challanService.getChallanById(req.params.id);
        res.status(200).json({ success: true, data: challan });
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryChallan = async (req, res, next) => {
    try {
        const challan = await challanService.updateDeliveryChallan(req.params.id, req.body, req.user || {});
        res.status(200).json({ success: true, data: challan, message: 'Delivery Challan updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const logPdfDownload = async (req, res, next) => {
    try {
        const { referenceNumber, details } = req.body;
        await challanService.logPdfDownload(referenceNumber, req.user || {}, details);
        res.status(200).json({ success: true, message: 'PDF download logged' });
    } catch (error) {
        next(error);
    }
};
