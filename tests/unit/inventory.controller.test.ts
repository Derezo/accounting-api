// Mock services first
jest.mock('../../src/services/inventory.service', () => ({
  inventoryService: {
    createInventoryItem: jest.fn(),
    getInventoryItemById: jest.fn(),
    getInventoryItems: jest.fn(),
    updateInventoryItem: jest.fn(),
    adjustQuantity: jest.fn(),
    transferInventory: jest.fn(),
    deleteInventoryItem: jest.fn(),
    getInventoryStats: jest.fn(),
    getLowStockItems: jest.fn(),
  },
}));

import { Request, Response, NextFunction } from 'express';
import {
  createInventoryItem,
  getInventoryItemById,
  getInventoryItems,
  updateInventoryItem,
  adjustQuantity,
  transferInventory,
  deleteInventoryItem,
  getInventoryStats,
  getLowStockItems,
} from '../../src/controllers/inventory.controller';
import { inventoryService } from '../../src/services/inventory.service';
import { AuthenticationError } from '../../src/utils/errors';

const mockInventoryService = inventoryService as jest.Mocked<typeof inventoryService>;

describe('InventoryController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: "user-123", organizationId: "org-123", role: "ADMIN", sessionId: "session-123" },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('createInventoryItem', () => {
    it('should create an inventory item successfully', async () => {
      const itemData = {
        itemCode: 'CHAIR-001',
        name: 'Office Chair',
        itemType: 'PRODUCT',
        unitOfMeasure: 'UNIT',
        unitCost: 200,
        unitPrice: 400,
        quantityOnHand: 50,
      };

      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = itemData;

      const createdItem = { id: 'item-123', ...itemData };
      mockInventoryService.createInventoryItem.mockResolvedValue(createdItem as any);

      await createInventoryItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.createInventoryItem).toHaveBeenCalledWith(
        {
          organizationId: 'org-123',
          ...itemData,
        },
        'user-123'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: createdItem,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123' };

      await createInventoryItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = { name: 'Test Item' };

      const error = new Error('Service error');
      mockInventoryService.createInventoryItem.mockRejectedValue(error);

      await createInventoryItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getInventoryItemById', () => {
    it('should get an inventory item by ID', async () => {
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };

      const item = {
        id: 'item-123',
        itemCode: 'CHAIR-001',
        name: 'Office Chair',
        quantityOnHand: 50,
      };
      mockInventoryService.getInventoryItemById.mockResolvedValue(item as any);

      await getInventoryItemById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.getInventoryItemById).toHaveBeenCalledWith(
        'item-123',
        'org-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: item,
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };

      const error = new Error('Not found');
      mockInventoryService.getInventoryItemById.mockRejectedValue(error);

      await getInventoryItemById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getInventoryItems', () => {
    it('should get inventory items with filters and pagination', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        itemType: 'PRODUCT',
        status: 'ACTIVE',
        limit: '20',
        cursor: 'cursor-123',
      };

      const result = {
        items: [
          { id: 'item-1', name: 'Item 1' },
          { id: 'item-2', name: 'Item 2' },
        ],
        hasMore: true,
        nextCursor: 'cursor-456',
      };
      mockInventoryService.getInventoryItems.mockResolvedValue(result as any);

      await getInventoryItems(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.getInventoryItems).toHaveBeenCalledWith(
        'org-123',
        {
          itemType: 'PRODUCT',
          status: 'ACTIVE',
        },
        {
          limit: 20,
          cursor: 'cursor-123',
        }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: result.items,
        pagination: {
          hasMore: true,
          nextCursor: 'cursor-456',
        },
      });
    });

    it('should handle stock filters', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        lowStock: 'true',
        outOfStock: 'false',
        search: 'chair',
      };

      const result = { items: [], hasMore: false, nextCursor: null };
      mockInventoryService.getInventoryItems.mockResolvedValue(result as any);

      await getInventoryItems(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.getInventoryItems).toHaveBeenCalledWith(
        'org-123',
        {
          lowStock: true,
          outOfStock: false,
          search: 'chair',
        },
        {}
      );
    });
  });

  describe('updateInventoryItem', () => {
    it('should update an inventory item', async () => {
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };
      mockRequest.body = { unitPrice: 450, status: 'ACTIVE' };

      const updatedItem = { id: 'item-123', unitPrice: 450 };
      mockInventoryService.updateInventoryItem.mockResolvedValue(updatedItem as any);

      await updateInventoryItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.updateInventoryItem).toHaveBeenCalledWith(
        'item-123',
        'org-123',
        { unitPrice: 450, status: 'ACTIVE' },
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedItem,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };

      await updateInventoryItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('adjustQuantity', () => {
    it('should adjust inventory quantity', async () => {
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };
      mockRequest.body = {
        quantity: 10,
        reason: 'PURCHASE',
        notes: 'Restocking',
      };

      const updatedItem = { id: 'item-123', quantityOnHand: 60 };
      mockInventoryService.adjustQuantity.mockResolvedValue(updatedItem as any);

      await adjustQuantity(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockInventoryService.adjustQuantity).toHaveBeenCalledWith(
        'item-123',
        'org-123',
        mockRequest.body,
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedItem,
        message: 'Inventory quantity adjusted successfully',
      });
    });

    it('should handle negative adjustments', async () => {
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };
      mockRequest.body = {
        quantity: -5,
        reason: 'DAMAGE',
        notes: 'Damaged items',
      };

      const updatedItem = { id: 'item-123', quantityOnHand: 45 };
      mockInventoryService.adjustQuantity.mockResolvedValue(updatedItem as any);

      await adjustQuantity(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockInventoryService.adjustQuantity).toHaveBeenCalledWith(
        'item-123',
        'org-123',
        mockRequest.body,
        'user-123'
      );
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };

      await adjustQuantity(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('transferInventory', () => {
    it('should transfer inventory between locations', async () => {
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };
      mockRequest.body = {
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2',
        quantity: 10,
        notes: 'Transfer to warehouse',
      };

      const updatedItem = { id: 'item-123', quantityOnHand: 50 };
      mockInventoryService.transferInventory.mockResolvedValue(updatedItem as any);

      await transferInventory(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.transferInventory).toHaveBeenCalledWith(
        'item-123',
        'org-123',
        mockRequest.body,
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedItem,
        message: 'Inventory transferred successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };

      await transferInventory(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('deleteInventoryItem', () => {
    it('should delete an inventory item', async () => {
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };

      mockInventoryService.deleteInventoryItem.mockResolvedValue(undefined);

      await deleteInventoryItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.deleteInventoryItem).toHaveBeenCalledWith(
        'item-123',
        'org-123',
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Inventory item deleted successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', itemId: 'item-123' };

      await deleteInventoryItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('getInventoryStats', () => {
    it('should get inventory statistics', async () => {
      mockRequest.params = { organizationId: 'org-123' };

      const stats = {
        totalItems: 150,
        totalValue: 750000,
        lowStockCount: 12,
        outOfStockCount: 3,
        lowStockItems: 12,
        outOfStockItems: 3,
        activeItems: 140,
      };
      mockInventoryService.getInventoryStats.mockResolvedValue(stats as any);

      await getInventoryStats(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.getInventoryStats).toHaveBeenCalledWith('org-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: stats,
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123' };

      const error = new Error('Stats calculation failed');
      mockInventoryService.getInventoryStats.mockRejectedValue(error);

      await getInventoryStats(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getLowStockItems', () => {
    it('should get low stock items', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = { limit: '50' };

      const items = [
        { id: 'item-1', name: 'Item 1', quantityOnHand: 5, reorderPoint: 10 },
        { id: 'item-2', name: 'Item 2', quantityOnHand: 2, reorderPoint: 15 },
      ];
      mockInventoryService.getLowStockItems.mockResolvedValue(items as any);

      await getLowStockItems(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.getLowStockItems).toHaveBeenCalledWith('org-123', {
        limit: 50,
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: items,
      });
    });

    it('should work without pagination', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {};

      const items: never[] = [];
      mockInventoryService.getLowStockItems.mockResolvedValue(items);

      await getLowStockItems(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockInventoryService.getLowStockItems).toHaveBeenCalledWith('org-123', {});
    });
  });
});