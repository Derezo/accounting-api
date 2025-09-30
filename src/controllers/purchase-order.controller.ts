import { Request, Response, NextFunction } from 'express';
import { purchaseOrderService } from '../services/purchase-order.service';
import { AuthenticationError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * @swagger
 * tags:
 *   name: Purchase Orders
 *   description: Purchase order management endpoints
 */

/**
 * Create a new purchase order
 * @route POST /api/v1/organizations/:organizationId/purchase-orders
 */
export const createPurchaseOrder = async (
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

    const purchaseOrder = await purchaseOrderService.createPurchaseOrder(
      {
        organizationId,
        ...req.body,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get purchase order by ID
 * @route GET /api/v1/organizations/:organizationId/purchase-orders/:poId
 */
export const getPurchaseOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, purchaseOrderId } = req.params;

    const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(
      purchaseOrderId,
      organizationId
    );

    res.json({
      success: true,
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all purchase orders
 * @route GET /api/v1/organizations/:organizationId/purchase-orders
 */
export const getPurchaseOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const {
      vendorId,
      status,
      priority,
      orderDateFrom,
      orderDateTo,
      search,
      limit,
      cursor,
    } = req.query;

    const filters: any = {};
    if (vendorId) filters.vendorId = vendorId as string;
    if (status) filters.status = status as string;
    if (priority) filters.priority = priority as string;
    if (orderDateFrom) filters.orderDateFrom = new Date(orderDateFrom as string);
    if (orderDateTo) filters.orderDateTo = new Date(orderDateTo as string);
    if (search) filters.search = search as string;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (cursor) pagination.cursor = cursor as string;

    const result = await purchaseOrderService.getPurchaseOrders(
      organizationId,
      filters,
      pagination
    );

    res.json({
      success: true,
      data: result.purchaseOrders,
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
 * Update purchase order
 * @route PUT /api/v1/organizations/:organizationId/purchase-orders/:poId
 */
export const updatePurchaseOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, purchaseOrderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(
      purchaseOrderId,
      organizationId,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve purchase order
 * @route POST /api/v1/organizations/:organizationId/purchase-orders/:poId/approve
 */
export const approvePurchaseOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, purchaseOrderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const purchaseOrder = await purchaseOrderService.approvePurchaseOrder(
      purchaseOrderId,
      organizationId,
      userId
    );

    res.json({
      success: true,
      data: purchaseOrder,
      message: 'Purchase order approved successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Receive items for purchase order
 * @route POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/receive
 */
export const receiveItems = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, purchaseOrderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const purchaseOrder = await purchaseOrderService.receiveItems(
      purchaseOrderId,
      organizationId,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: purchaseOrder,
      message: 'Items received successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Close purchase order
 * @route POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/close
 */
export const closePurchaseOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, purchaseOrderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const purchaseOrder = await purchaseOrderService.closePurchaseOrder(
      purchaseOrderId,
      organizationId,
      userId
    );

    res.json({
      success: true,
      data: purchaseOrder,
      message: 'Purchase order closed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel purchase order
 * @route POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/cancel
 */
export const cancelPurchaseOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, purchaseOrderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const purchaseOrder = await purchaseOrderService.cancelPurchaseOrder(
      purchaseOrderId,
      organizationId,
      userId
    );

    res.json({
      success: true,
      data: purchaseOrder,
      message: 'Purchase order cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete purchase order
 * @route DELETE /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId
 */
export const deletePurchaseOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, purchaseOrderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    await purchaseOrderService.deletePurchaseOrder(
      purchaseOrderId,
      organizationId,
      userId
    );

    res.json({
      success: true,
      message: 'Purchase order deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get purchase order statistics
 * @route GET /api/v1/organizations/:organizationId/purchase-orders/stats
 */
export const getPurchaseOrderStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const { vendorId } = req.query;

    const stats = await purchaseOrderService.getPurchaseOrderStats(
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