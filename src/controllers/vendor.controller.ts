import { Request, Response, NextFunction } from 'express';
import { vendorService } from '../services/vendor.service';
import { AuthenticationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * @swagger
 * tags:
 *   name: Vendors
 *   description: Vendor management endpoints
 */

/**
 * Create a new vendor
 * @route POST /api/v1/organizations/:organizationId/vendors
 */
export const createVendor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const vendor = await vendorService.createVendor(
      {
        organizationId,
        ...req.body,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get vendor by ID
 * @route GET /api/v1/organizations/:organizationId/vendors/:vendorId
 */
export const getVendorById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, vendorId } = req.params;

    const vendor = await vendorService.getVendorById(vendorId, organizationId);

    res.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all vendors
 * @route GET /api/v1/organizations/:organizationId/vendors
 */
export const getVendors = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const {
      status,
      vendorType,
      currency,
      category,
      isActive,
      search,
      limit,
      cursor,
    } = req.query;

    const filters: any = {};
    if (status) filters.status = status as string;
    if (vendorType) filters.vendorType = vendorType as string;
    if (currency) filters.currency = currency as string;
    if (category) filters.category = category as string;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (search) filters.search = search as string;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (cursor) pagination.cursor = cursor as string;

    const result = await vendorService.getVendors(
      organizationId,
      filters,
      pagination
    );

    res.json({
      success: true,
      data: result.vendors,
      pagination: {
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update vendor
 * @route PUT /api/v1/organizations/:organizationId/vendors/:vendorId
 */
export const updateVendor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, vendorId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const vendor = await vendorService.updateVendor(
      vendorId,
      organizationId,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete vendor
 * @route DELETE /api/v1/organizations/:organizationId/vendors/:vendorId
 */
export const deleteVendor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, vendorId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    await vendorService.deleteVendor(vendorId, organizationId, userId);

    res.json({
      success: true,
      message: 'Vendor deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get vendor statistics
 * @route GET /api/v1/organizations/:organizationId/vendors/:vendorId/stats
 */
export const getVendorStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, vendorId } = req.params;

    const stats = await vendorService.getVendorStats(vendorId, organizationId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get vendor payment history
 * @route GET /api/v1/organizations/:organizationId/vendors/:vendorId/payments
 */
export const getVendorPaymentHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, vendorId } = req.params;
    const { startDate, endDate, limit } = req.query;

    const dateFilters: any = {};
    if (startDate) dateFilters.startDate = new Date(startDate as string);
    if (endDate) dateFilters.endDate = new Date(endDate as string);

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);

    const history = await vendorService.getVendorPaymentHistory(
      vendorId,
      organizationId,
      dateFilters,
      pagination
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};