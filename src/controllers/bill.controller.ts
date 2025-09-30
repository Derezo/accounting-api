import { Request, Response, NextFunction } from 'express';
import { billService } from '../services/bill.service';
import { AuthenticationError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * @swagger
 * tags:
 *   name: Bills
 *   description: Vendor bill management endpoints
 */

/**
 * Create a new bill
 * @route POST /api/v1/organizations/:organizationId/bills
 */
export const createBill = async (
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

    const bill = await billService.createBill(
      {
        organizationId,
        ...req.body,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get bill by ID
 * @route GET /api/v1/organizations/:organizationId/bills/:billId
 */
export const getBillById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, billId } = req.params;

    const bill = await billService.getBillById(billId, organizationId);

    res.json({
      success: true,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all bills
 * @route GET /api/v1/organizations/:organizationId/bills
 */
export const getBills = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const {
      vendorId,
      status,
      dueDateFrom,
      dueDateTo,
      overdue,
      search,
      limit,
      cursor,
    } = req.query;

    const filters: any = {};
    if (vendorId) filters.vendorId = vendorId as string;
    if (status) filters.status = status as string;
    if (dueDateFrom) filters.dueDateFrom = new Date(dueDateFrom as string);
    if (dueDateTo) filters.dueDateTo = new Date(dueDateTo as string);
    if (overdue) filters.overdue = overdue === 'true';
    if (search) filters.search = search as string;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (cursor) pagination.cursor = cursor as string;

    const result = await billService.getBills(
      organizationId,
      filters,
      pagination
    );

    res.json({
      success: true,
      data: result.bills,
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
 * Update bill
 * @route PUT /api/v1/organizations/:organizationId/bills/:billId
 */
export const updateBill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, billId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const bill = await billService.updateBill(
      billId,
      organizationId,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve bill
 * @route POST /api/v1/organizations/:organizationId/bills/:billId/approve
 */
export const approveBill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, billId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const bill = await billService.approveBill(billId, organizationId, userId);

    res.json({
      success: true,
      data: bill,
      message: 'Bill approved successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record payment against bill
 * @route POST /api/v1/organizations/:organizationId/bills/:billId/payments
 */
export const recordBillPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, billId } = req.params;
    const { amount } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    if (!amount || amount <= 0) {
      throw new ValidationError('Valid payment amount required');
    }

    const bill = await billService.recordPayment(
      billId,
      organizationId,
      amount,
      userId
    );

    res.json({
      success: true,
      data: bill,
      message: 'Payment recorded successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete bill
 * @route DELETE /api/v1/organizations/:organizationId/bills/:billId
 */
export const deleteBill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, billId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    await billService.deleteBill(billId, organizationId, userId);

    res.json({
      success: true,
      message: 'Bill deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get bill statistics
 * @route GET /api/v1/organizations/:organizationId/bills/stats
 */
export const getBillStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const { vendorId } = req.query;

    const stats = await billService.getBillStats(
      organizationId,
      vendorId as string | undefined
    );

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};