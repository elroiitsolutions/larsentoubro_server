import * as vendorService from '../services/vendor.service.js';

/**
 * [WEB] Vendor Controller
 * Exclusively consumed by Web Application (client/src/services/vendor.service.ts).
 */

/**
 * [WEB] getVendors - Fetch paginated subcontractor/vendor list
 */
export const getVendors = async (req, res, next) => {
    try {
        const result = await vendorService.getVendors(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [WEB] getVendorById - Fetch vendor details by ID
 */
export const getVendorById = async (req, res, next) => {
    try {
        const vendor = await vendorService.getVendorById(req.params.id);
        res.status(200).json({ success: true, data: vendor });
    } catch (error) {
        next(error);
    }
};

/**
 * [WEB] createVendor - Create a new vendor profile
 */
export const createVendor = async (req, res, next) => {
    try {
        const vendor = await vendorService.createVendor(req.body);
        res.status(201).json({ success: true, data: vendor });
    } catch (error) {
        next(error);
    }
};

/**
 * [WEB] updateVendor - Update existing vendor profile
 */
export const updateVendor = async (req, res, next) => {
    try {
        const vendor = await vendorService.updateVendor(req.params.id, req.body);
        res.status(200).json({ success: true, data: vendor });
    } catch (error) {
        next(error);
    }
};

/**
 * [WEB] deleteVendor - Remove vendor profile
 */
export const deleteVendor = async (req, res, next) => {
    try {
        await vendorService.deleteVendor(req.params.id);
        res.status(200).json({ success: true, message: 'Vendor deleted successfully' });
    } catch (error) {
        next(error);
    }
};
