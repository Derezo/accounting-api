// Mock services first
jest.mock('../../src/services/vendor.service', () => ({
  vendorService: {
    createVendor: jest.fn(),
    getVendorById: jest.fn(),
    getVendors: jest.fn(),
    updateVendor: jest.fn(),
    deleteVendor: jest.fn(),
    getVendorStats: jest.fn(),
    getVendorPaymentHistory: jest.fn(),
  },
}));

import { Request, Response, NextFunction } from 'express';
import {
  createVendor,
  getVendorById,
  getVendors,
  updateVendor,
  deleteVendor,
  getVendorStats,
  getVendorPaymentHistory,
} from '../../src/controllers/vendor.controller';
import { vendorService } from '../../src/services/vendor.service';
import { AuthenticationError } from '../../src/utils/errors';

const mockVendorService = vendorService as jest.Mocked<typeof vendorService>;

describe('VendorController', () => {
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

  describe('createVendor', () => {
    it('should create a vendor successfully', async () => {
      const vendorData = {
        name: 'Office Supplies Inc',
        vendorType: 'SUPPLIER',
        email: 'contact@officesupplies.com',
        phone: '555-1234',
        status: 'ACTIVE',
        currency: 'CAD',
      };

      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = vendorData;

      const createdVendor = { id: 'vendor-123', ...vendorData };
      mockVendorService.createVendor.mockResolvedValue(createdVendor);

      await createVendor(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockVendorService.createVendor).toHaveBeenCalledWith(
        {
          organizationId: 'org-123',
          ...vendorData,
        },
        'user-123'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: createdVendor,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123' };

      await createVendor(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = { name: 'Test Vendor' };

      const error = new Error('Service error');
      mockVendorService.createVendor.mockRejectedValue(error);

      await createVendor(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getVendorById', () => {
    it('should get a vendor by ID', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };

      const vendor = {
        id: 'vendor-123',
        name: 'Office Supplies Inc',
        vendorType: 'SUPPLIER',
        status: 'ACTIVE',
      };
      mockVendorService.getVendorById.mockResolvedValue(vendor);

      await getVendorById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockVendorService.getVendorById).toHaveBeenCalledWith('vendor-123', 'org-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: vendor,
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };

      const error = new Error('Not found');
      mockVendorService.getVendorById.mockRejectedValue(error);

      await getVendorById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getVendors', () => {
    it('should get vendors with filters and pagination', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        status: 'ACTIVE',
        vendorType: 'SUPPLIER',
        limit: '20',
        cursor: 'cursor-123',
      };

      const result = {
        vendors: [
          { id: 'vendor-1', name: 'Vendor 1' },
          { id: 'vendor-2', name: 'Vendor 2' },
        ],
        hasMore: true,
        nextCursor: 'cursor-456',
      };
      mockVendorService.getVendors.mockResolvedValue(result);

      await getVendors(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockVendorService.getVendors).toHaveBeenCalledWith(
        'org-123',
        {
          status: 'ACTIVE',
          vendorType: 'SUPPLIER',
        },
        {
          limit: 20,
          cursor: 'cursor-123',
        }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: result.vendors,
        pagination: {
          hasMore: true,
          nextCursor: 'cursor-456',
        },
      });
    });

    it('should handle search filters', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        search: 'office',
        currency: 'CAD',
      };

      const result = { vendors: [], hasMore: false, nextCursor: null };
      mockVendorService.getVendors.mockResolvedValue(result);

      await getVendors(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockVendorService.getVendors).toHaveBeenCalledWith(
        'org-123',
        {
          search: 'office',
          currency: 'CAD',
        },
        {}
      );
    });
  });

  describe('updateVendor', () => {
    it('should update a vendor', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };
      mockRequest.body = { status: 'INACTIVE', email: 'newemail@vendor.com' };

      const updatedVendor = { id: 'vendor-123', status: 'INACTIVE' };
      mockVendorService.updateVendor.mockResolvedValue(updatedVendor);

      await updateVendor(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockVendorService.updateVendor).toHaveBeenCalledWith(
        'vendor-123',
        'org-123',
        { status: 'INACTIVE', email: 'newemail@vendor.com' },
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedVendor,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };

      await updateVendor(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('deleteVendor', () => {
    it('should delete a vendor', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };

      mockVendorService.deleteVendor.mockResolvedValue(undefined);

      await deleteVendor(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockVendorService.deleteVendor).toHaveBeenCalledWith(
        'vendor-123',
        'org-123',
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Vendor deleted successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };

      await deleteVendor(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('getVendorStats', () => {
    it('should get vendor statistics', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };

      const stats = {
        totalBills: 25,
        totalSpent: 50000,
        unpaidAmount: 5000,
        averagePaymentDays: 28,
      };
      mockVendorService.getVendorStats.mockResolvedValue(stats);

      await getVendorStats(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockVendorService.getVendorStats).toHaveBeenCalledWith('vendor-123', 'org-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: stats,
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };

      const error = new Error('Stats calculation failed');
      mockVendorService.getVendorStats.mockRejectedValue(error);

      await getVendorStats(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getVendorPaymentHistory', () => {
    it('should get vendor payment history', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };
      mockRequest.query = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        limit: '50',
      };

      const history = [
        { id: 'payment-1', amount: 1000, date: new Date('2025-01-15') },
        { id: 'payment-2', amount: 2000, date: new Date('2025-02-15') },
      ];
      mockVendorService.getVendorPaymentHistory.mockResolvedValue(history);

      await getVendorPaymentHistory(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockVendorService.getVendorPaymentHistory).toHaveBeenCalledWith(
        'vendor-123',
        'org-123',
        {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
        { limit: 50 }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: history,
      });
    });

    it('should work without date filters', async () => {
      mockRequest.params = { organizationId: 'org-123', vendorId: 'vendor-123' };
      mockRequest.query = {};

      const history: never[] = [];
      mockVendorService.getVendorPaymentHistory.mockResolvedValue(history);

      await getVendorPaymentHistory(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockVendorService.getVendorPaymentHistory).toHaveBeenCalledWith(
        'vendor-123',
        'org-123',
        {},
        {}
      );
    });
  });
});