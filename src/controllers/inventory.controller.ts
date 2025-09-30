import { Request, Response, NextFunction } from 'express';
import { inventoryService } from '../services/inventory.service';
import { AuthenticationError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Inventory management endpoints
 */

/**
 * Create inventory item
 * @route POST /api/v1/organizations/:organizationId/inventory
 */
export const createInventoryItem = async (
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

    const item = await inventoryService.createInventoryItem(
      {
        organizationId,
        ...req.body,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inventory item by ID
 * @route GET /api/v1/organizations/:organizationId/inventory/:itemId
 */
export const getInventoryItemById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, itemId } = req.params;

    const item = await inventoryService.getInventoryItemById(
      itemId,
      organizationId
    );

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all inventory items
 * @route GET /api/v1/organizations/:organizationId/inventory
 */
export const getInventoryItems = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const {
      itemType,
      status,
      productId,
      locationId,
      lowStock,
      outOfStock,
      search,
      limit,
      cursor,
    } = req.query;

    const filters: any = {};
    if (itemType) filters.itemType = itemType as string;
    if (status) filters.status = status as string;
    if (productId) filters.productId = productId as string;
    if (locationId) filters.locationId = locationId as string;
    if (lowStock !== undefined) filters.lowStock = lowStock === 'true';
    if (outOfStock !== undefined) filters.outOfStock = outOfStock === 'true';
    if (search) filters.search = search as string;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (cursor) pagination.cursor = cursor as string;

    const result = await inventoryService.getInventoryItems(
      organizationId,
      filters,
      pagination
    );

    res.json({
      success: true,
      data: result.items,
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
 * Update inventory item
 * @route PUT /api/v1/organizations/:organizationId/inventory/:itemId
 */
export const updateInventoryItem = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, itemId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const item = await inventoryService.updateInventoryItem(
      itemId,
      organizationId,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create inventory transaction
 * @route POST /api/v1/organizations/:organizationId/inventory/transactions
 */
export const createInventoryTransaction = async (
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

    const transaction = await inventoryService.createTransaction(
      {
        organizationId,
        ...req.body,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inventory transactions
 * @route GET /api/v1/organizations/:organizationId/inventory/transactions
 */
export const getInventoryTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const {
      inventoryItemId,
      type,
      dateFrom,
      dateTo,
      referenceType,
      limit,
      cursor,
    } = req.query;

    const filters: any = {};
    if (inventoryItemId) filters.inventoryItemId = inventoryItemId as string;
    if (type) filters.type = type as string;
    if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
    if (dateTo) filters.dateTo = new Date(dateTo as string);
    if (referenceType) filters.referenceType = referenceType as string;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (cursor) pagination.cursor = cursor as string;

    const result = await inventoryService.getTransactions(
      organizationId,
      filters,
      pagination
    );

    res.json({
      success: true,
      data: result.transactions,
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
 * Get inventory valuation
 * @route GET /api/v1/organizations/:organizationId/inventory/valuation
 */
export const getInventoryValuation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const { locationId } = req.query;

    const valuation = await inventoryService.getInventoryValuation(
      organizationId,
      locationId as string | undefined
    );

    res.json({
      success: true,
      data: valuation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get low stock items
 * @route GET /api/v1/organizations/:organizationId/inventory/low-stock
 */
export const getLowStockItems = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const { locationId, limit } = req.query;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);

    const items = await inventoryService.getLowStockItems(
      organizationId,
      pagination
    );

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Perform stock count
 * @route POST /api/v1/organizations/:organizationId/inventory/:itemId/stock-count
 */
export const performStockCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, itemId } = req.params;
    const { countedQuantity, notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    if (countedQuantity === undefined || countedQuantity < 0) {
      throw new ValidationError('Valid counted quantity required');
    }

    const transaction = await inventoryService.performStockCount(
      itemId,
      organizationId,
      countedQuantity,
      userId,
      notes
    );

    res.json({
      success: true,
      data: transaction,
      message: 'Stock count adjustment recorded',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Adjust inventory quantity
 * @route POST /api/v1/organizations/:organizationId/inventory/:itemId/adjust
 */
export const adjustQuantity = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, itemId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const item = await inventoryService.adjustQuantity(
      itemId,
      organizationId,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: item,
      message: 'Inventory quantity adjusted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Transfer inventory between locations
 * @route POST /api/v1/organizations/:organizationId/inventory/:itemId/transfer
 */
export const transferInventory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, itemId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const item = await inventoryService.transferInventory(
      itemId,
      organizationId,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: item,
      message: 'Inventory transferred successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete inventory item
 * @route DELETE /api/v1/organizations/:organizationId/inventory/:itemId
 */
export const deleteInventoryItem = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId, itemId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    await inventoryService.deleteInventoryItem(itemId, organizationId, userId);

    res.json({
      success: true,
      message: 'Inventory item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inventory statistics
 * @route GET /api/v1/organizations/:organizationId/inventory/stats
 */
export const getInventoryStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;

    const stats = await inventoryService.getInventoryStats(organizationId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};