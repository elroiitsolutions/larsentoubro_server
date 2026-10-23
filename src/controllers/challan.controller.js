import * as challanService from '../services/challan.service.js';
import * as challanPdfService from '../services/challanPdf.service.js';

/**
 * [SHARED] & [APP] Challan Controller
 * Handles Delivery, Return, and Scrap Challans.
 * All core operations are [SHARED], except cancellation which is exclusively [APP].
 */

/**
 * [SHARED] createDeliveryChallan - Issue tools out to subcontractors via Delivery Challan (DC)
 */
export const createDeliveryChallan = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin' && req.user.hasInspectionAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Users with Inspection access cannot create delivery challans.'
            });
        }
        const challan = await challanService.createDeliveryChallan(req.body, req.user || {});
        res.status(201).json({ success: true, data: challan, message: 'Delivery Challan created successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] createScrapDeliveryChallan - Issue scrapped tools via Scrap Delivery Challan (SDC)
 */
export const createScrapDeliveryChallan = async (req, res, next) => {
    try {
        if (req.user && req.user.role !== 'Admin' && req.user.hasInspectionAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Users with Inspection access cannot create scrap delivery challans.'
            });
        }
        const challan = await challanService.createScrapDeliveryChallan(req.body, req.user || {});
        res.status(201).json({ success: true, data: challan, message: 'Scrap Delivery Challan created successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] createReturnChallan - Receive tools back into store inventory via Return Challan (RC)
 */
export const createReturnChallan = async (req, res, next) => {
    try {
        const challan = await challanService.createReturnChallan(req.body, req.user || {});
        res.status(201).json({ success: true, data: challan, message: 'Return Challan created successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getChallans - Query challans list with status and vendor filtering
 */
export const getChallans = async (req, res, next) => {
    try {
        const queryParams = { ...req.query };
        if (req.user && req.user.role === 'Vendor') {
            queryParams.vendor = req.user._id ? req.user._id.toString() : (req.user.vendorCode || req.user.email);
        }
        const result = await challanService.getChallans(queryParams);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getChallanById - Get full challan details and tool items by ID
 */
export const getChallanById = async (req, res, next) => {
    try {
        const challan = await challanService.getChallanById(req.params.id);
        res.status(200).json({ success: true, data: challan });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] updateDeliveryChallan - Modify non-finalized delivery challan properties
 */
export const updateDeliveryChallan = async (req, res, next) => {
    try {
        const challan = await challanService.updateDeliveryChallan(req.params.id, req.body, req.user || {});
        res.status(200).json({ success: true, data: challan, message: 'Delivery Challan updated successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] logPdfDownload - Record PDF download event in challan history
 */
export const logPdfDownload = async (req, res, next) => {
    try {
        const { referenceNumber, details } = req.body;
        await challanService.logPdfDownload(referenceNumber, req.user || {}, details);
        res.status(200).json({ success: true, message: 'PDF download logged' });
    } catch (error) {
        next(error);
    }
};

/**
 * [APP] cancelDeliveryChallan - Cancel active DC and revert tool statuses to Available
 * Exclusively consumed by Mobile App challan action menu (larsentoubro-app/src/features/challans/services/challanService.ts).
 */
export const cancelDeliveryChallan = async (req, res, next) => {
    try {
        const { reason } = req.body;
        const challan = await challanService.cancelDeliveryChallan(req.params.id, reason, req.user || {});
        res.status(200).json({ success: true, data: challan, message: 'Delivery Challan cancelled successfully and tools reverted to Available' });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] downloadChallanPdf - Stream formatted Delivery / Return Challan PDF
 */
export const downloadChallanPdf = async (req, res, next) => {
    try {
        const challan = await challanService.getChallanById(req.params.id);
        if (!challan) {
            return res.status(404).json({ success: false, message: 'Challan not found' });
        }

        const safeNumber = String(challan.challanNumber || challan._id || 'Challan').replace(/[/\\?%*:|"<>]/g, '-');
        const filename = `${safeNumber}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await challanPdfService.streamChallanPdf(challan, res);

        // Record audit download log in background
        challanService.logPdfDownload(challan.challanNumber || challan._id, req.user || {}, 'Downloaded Official Challan PDF').catch(() => {});
    } catch (error) {
        next(error);
    }
};

