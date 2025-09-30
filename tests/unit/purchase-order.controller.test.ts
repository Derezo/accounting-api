// Mock services first
jest.mock('../../src/services/purchase-order.service', () => ({
  purchaseOrderService: {
    createPurchaseOrder: jest.fn(),
    getPurchaseOrderById: jest.fn(),
    getPurchaseOrders: jest.fn(),
    updatePurchaseOrder: jest.fn(),
    approvePurchaseOrder: jest.fn(),
    receiveItems: jest.fn(),
    closePurchaseOrder: jest.fn(),
    cancelPurchaseOrder: jest.fn(),
    deletePurchaseOrder: jest.fn(),
    getPurchaseOrderStats: jest.fn(),
  },
}));

import { Request, Response, NextFunction } from 'express';
import {
  createPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrders,
  updatePurchaseOrder,
  approvePurchaseOrder,
  receiveItems,
  closePurchaseOrder,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderStats,
} from '../../src/controllers/purchase-order.controller';
import { purchaseOrderService } from '../../src/services/purchase-order.service';
import { AuthenticationError } from '../../src/utils/errors';

const mockPurchaseOrderService = purchaseOrderService as jest.Mocked<
  typeof purchaseOrderService
>;

describe('PurchaseOrderController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123' },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('createPurchaseOrder', () => {
    it('should create a purchase order successfully', async () => {
      const poData = {
        vendorId: 'vendor-123',
        poNumber: 'PO-001',
        orderDate: new Date('2025-01-01'),
        expectedDeliveryDate: new Date('2025-01-15'),
        subtotal: 5000,
        taxAmount: 650,
        totalAmount: 5650,
        lineItems: [
          {
            inventoryItemId: 'item-123',
            description: 'Office Chairs',
            quantity: 10,
            unitPrice: 500,
            amount: 5000,
          },
        ],
      };

      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = poData;

      const createdPO = { id: 'po-123', ...poData };
      mockPurchaseOrderService.createPurchaseOrder.mockResolvedValue(createdPO);

      await createPurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.createPurchaseOrder).toHaveBeenCalledWith(
        {
          organizationId: 'org-123',
          ...poData,
        },
        'user-123'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: createdPO,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123' };

      await createPurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = { vendorId: 'vendor-123' };

      const error = new Error('Service error');
      mockPurchaseOrderService.createPurchaseOrder.mockRejectedValue(error);

      await createPurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getPurchaseOrderById', () => {
    it('should get a purchase order by ID', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      const po = {
        id: 'po-123',
        vendorId: 'vendor-123',
        poNumber: 'PO-001',
        totalAmount: 5650,
      };
      mockPurchaseOrderService.getPurchaseOrderById.mockResolvedValue(po);

      await getPurchaseOrderById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.getPurchaseOrderById).toHaveBeenCalledWith(
        'po-123',
        'org-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: po,
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      const error = new Error('Not found');
      mockPurchaseOrderService.getPurchaseOrderById.mockRejectedValue(error);

      await getPurchaseOrderById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getPurchaseOrders', () => {
    it('should get purchase orders with filters and pagination', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        vendorId: 'vendor-123',
        status: 'APPROVED',
        priority: 'HIGH',
        limit: '20',
        cursor: 'cursor-123',
      };

      const result = {
        purchaseOrders: [
          { id: 'po-1', poNumber: 'PO-001' },
          { id: 'po-2', poNumber: 'PO-002' },
        ],
        hasMore: true,
        nextCursor: 'cursor-456',
      };
      mockPurchaseOrderService.getPurchaseOrders.mockResolvedValue(result);

      await getPurchaseOrders(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.getPurchaseOrders).toHaveBeenCalledWith(
        'org-123',
        {
          vendorId: 'vendor-123',
          status: 'APPROVED',
          priority: 'HIGH',
        },
        {
          limit: 20,
          cursor: 'cursor-123',
        }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: result.purchaseOrders,
        pagination: {
          hasMore: true,
          nextCursor: 'cursor-456',
        },
      });
    });

    it('should handle date range filters', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        orderDateFrom: '2025-01-01',
        orderDateTo: '2025-01-31',
      };

      const result = { purchaseOrders: [], hasMore: false, nextCursor: null };
      mockPurchaseOrderService.getPurchaseOrders.mockResolvedValue(result);

      await getPurchaseOrders(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.getPurchaseOrders).toHaveBeenCalledWith(
        'org-123',
        {
          orderDateFrom: new Date('2025-01-01'),
          orderDateTo: new Date('2025-01-31'),
        },
        {}
      );
    });
  });

  describe('updatePurchaseOrder', () => {
    it('should update a purchase order', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };
      mockRequest.body = { priority: 'URGENT', notes: 'Rush order' };

      const updatedPO = { id: 'po-123', priority: 'URGENT' };
      mockPurchaseOrderService.updatePurchaseOrder.mockResolvedValue(updatedPO);

      await updatePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.updatePurchaseOrder).toHaveBeenCalledWith(
        'po-123',
        'org-123',
        { priority: 'URGENT', notes: 'Rush order' },
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedPO,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      await updatePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('approvePurchaseOrder', () => {
    it('should approve a purchase order', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      const approvedPO = { id: 'po-123', status: 'APPROVED' };
      mockPurchaseOrderService.approvePurchaseOrder.mockResolvedValue(approvedPO);

      await approvePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.approvePurchaseOrder).toHaveBeenCalledWith(
        'po-123',
        'org-123',
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: approvedPO,
        message: 'Purchase order approved successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      await approvePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('receiveItems', () => {
    it('should receive items for a purchase order', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };
      mockRequest.body = {
        items: [
          { lineItemId: 'line-1', quantityReceived: 5 },
          { lineItemId: 'line-2', quantityReceived: 10 },
        ],
        notes: 'Partial delivery',
      };

      const updatedPO = { id: 'po-123', status: 'PARTIALLY_RECEIVED' };
      mockPurchaseOrderService.receiveItems.mockResolvedValue(updatedPO);

      await receiveItems(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockPurchaseOrderService.receiveItems).toHaveBeenCalledWith(
        'po-123',
        'org-123',
        mockRequest.body,
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedPO,
        message: 'Items received successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      await receiveItems(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('closePurchaseOrder', () => {
    it('should close a purchase order', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      const closedPO = { id: 'po-123', status: 'CLOSED' };
      mockPurchaseOrderService.closePurchaseOrder.mockResolvedValue(closedPO);

      await closePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.closePurchaseOrder).toHaveBeenCalledWith(
        'po-123',
        'org-123',
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: closedPO,
        message: 'Purchase order closed successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      await closePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('cancelPurchaseOrder', () => {
    it('should cancel a purchase order', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      const cancelledPO = { id: 'po-123', status: 'CANCELLED' };
      mockPurchaseOrderService.cancelPurchaseOrder.mockResolvedValue(cancelledPO);

      await cancelPurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.cancelPurchaseOrder).toHaveBeenCalledWith(
        'po-123',
        'org-123',
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: cancelledPO,
        message: 'Purchase order cancelled successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      await cancelPurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('deletePurchaseOrder', () => {
    it('should delete a purchase order', async () => {
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      mockPurchaseOrderService.deletePurchaseOrder.mockResolvedValue(undefined);

      await deletePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.deletePurchaseOrder).toHaveBeenCalledWith(
        'po-123',
        'org-123',
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Purchase order deleted successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = {
        organizationId: 'org-123',
        purchaseOrderId: 'po-123',
      };

      await deletePurchaseOrder(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('getPurchaseOrderStats', () => {
    it('should get purchase order statistics', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = { vendorId: 'vendor-123' };

      const stats = {
        totalOrders: 100,
        totalAmount: 500000,
        openOrders: 15,
        receivedOrders: 80,
      };
      mockPurchaseOrderService.getPurchaseOrderStats.mockResolvedValue(stats);

      await getPurchaseOrderStats(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.getPurchaseOrderStats).toHaveBeenCalledWith(
        'org-123',
        'vendor-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: stats,
      });
    });

    it('should get stats without vendor filter', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {};

      const stats = { totalOrders: 200 };
      mockPurchaseOrderService.getPurchaseOrderStats.mockResolvedValue(stats);

      await getPurchaseOrderStats(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockPurchaseOrderService.getPurchaseOrderStats).toHaveBeenCalledWith(
        'org-123',
        undefined
      );
    });
  });
});