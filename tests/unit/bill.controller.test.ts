// Mock services first
jest.mock('../../src/services/bill.service', () => ({
  billService: {
    createBill: jest.fn(),
    getBillById: jest.fn(),
    getBills: jest.fn(),
    updateBill: jest.fn(),
    approveBill: jest.fn(),
    recordPayment: jest.fn(),
    deleteBill: jest.fn(),
    getBillStats: jest.fn(),
  },
}));

import { Request, Response, NextFunction } from 'express';
import {
  createBill,
  getBillById,
  getBills,
  updateBill,
  approveBill,
  recordBillPayment,
  deleteBill,
  getBillStats,
} from '../../src/controllers/bill.controller';
import { billService } from '../../src/services/bill.service';
import { AuthenticationError, ValidationError } from '../../src/utils/errors';

const mockBillService = billService as jest.Mocked<typeof billService>;

// Helper to create a mock bill with proper structure
const createMockBill = (overrides: any = {}): any => ({
  id: 'bill-123',
  organizationId: 'org-123',
  vendorId: 'vendor-123',
  billNumber: 'BILL-001',
  billDate: new Date('2025-01-01'),
  dueDate: new Date('2025-01-31'),
  subtotalAmount: 1000,
  taxAmount: 130,
  totalAmount: 1130,
  paidAmount: 0,
  balanceAmount: 1130,
  status: 'DRAFT',
  notes: null,
  approvedBy: null,
  approvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  vendor: {
    id: 'vendor-123',
    organizationId: 'org-123',
    businessId: 'business-123',
    vendorNumber: 'VEN-001',
    accountNumber: null,
    paymentTerms: 'Net 30',
    taxId: null,
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    business: {
      id: 'business-123',
      organizationId: 'org-123',
      email: 'vendor@example.com',
      phone: '+1-555-0123',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      legalName: 'Vendor Company',
      operatingName: 'Vendor Co',
      website: null,
      industryType: null,
      yearEstablished: null,
      businessType: 'VENDOR',
    },
  },
  payments: [],
  lineItems: [
    {
      id: 'line-1',
      billId: 'bill-123',
      description: 'Office Supplies',
      quantity: 10,
      unitPrice: 100,
      amount: 1000,
      accountId: 'acc-123',
      productId: null,
      taxAmount: 130,
      createdAt: new Date(),
      updatedAt: new Date(),
      account: {
        id: 'acc-123',
        organizationId: 'org-123',
        accountNumber: '5000',
        name: 'Office Expenses',
        type: 'EXPENSE',
        description: null,
        parentId: null,
        isActive: true,
        isSystemAccount: false,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      product: null,
    },
  ],
  ...overrides,
});

describe('BillController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', organizationId: 'org-123', role: 'ADMIN', sessionId: 'session-123' },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('createBill', () => {
    it('should create a bill successfully', async () => {
      const billData = {
        vendorId: 'vendor-123',
        billNumber: 'BILL-001',
        billDate: new Date('2025-01-01'),
        dueDate: new Date('2025-01-31'),
        subtotal: 1000,
        taxAmount: 130,
        totalAmount: 1130,
        lineItems: [
          {
            description: 'Office Supplies',
            quantity: 10,
            unitPrice: 100,
            amount: 1000,
            accountId: 'acc-123',
          },
        ],
      };

      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = billData;

      const createdBill = createMockBill();
      mockBillService.createBill.mockResolvedValue(createdBill);

      await createBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.createBill).toHaveBeenCalledWith(
        {
          organizationId: 'org-123',
          ...billData,
        },
        'user-123'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: createdBill,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123' };

      await createBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.body = { vendorId: 'vendor-123' };

      const error = new Error('Service error');
      mockBillService.createBill.mockRejectedValue(error);

      await createBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getBillById', () => {
    it('should get a bill by ID', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };

      const bill = createMockBill();
      mockBillService.getBillById.mockResolvedValue(bill);

      await getBillById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.getBillById).toHaveBeenCalledWith('bill-123', 'org-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: bill,
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };

      const error = new Error('Not found');
      mockBillService.getBillById.mockRejectedValue(error);

      await getBillById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getBills', () => {
    it('should get bills with filters and pagination', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        vendorId: 'vendor-123',
        status: 'APPROVED',
        limit: '20',
        cursor: 'cursor-123',
      };

      const result = {
        bills: [
          createMockBill({ id: 'bill-1', billNumber: 'BILL-001' }),
          createMockBill({ id: 'bill-2', billNumber: 'BILL-002' }),
        ],
        hasMore: true,
        nextCursor: 'cursor-456',
      };
      mockBillService.getBills.mockResolvedValue(result);

      await getBills(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.getBills).toHaveBeenCalledWith(
        'org-123',
        {
          vendorId: 'vendor-123',
          status: 'APPROVED',
        },
        {
          limit: 20,
          cursor: 'cursor-123',
        }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: result.bills,
        pagination: {
          hasMore: true,
          nextCursor: 'cursor-456',
        },
      });
    });

    it('should handle date range filters', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {
        dueDateFrom: '2025-01-01',
        dueDateTo: '2025-01-31',
        overdue: 'true',
      };

      const result = { bills: [], hasMore: false, nextCursor: undefined };
      mockBillService.getBills.mockResolvedValue(result);

      await getBills(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.getBills).toHaveBeenCalledWith(
        'org-123',
        {
          dueDateFrom: new Date('2025-01-01'),
          dueDateTo: new Date('2025-01-31'),
          overdue: true,
        },
        {}
      );
    });
  });

  describe('updateBill', () => {
    it('should update a bill', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };
      mockRequest.body = { status: 'APPROVED', notes: 'Updated notes' };

      const updatedBill = createMockBill({ status: 'APPROVED', notes: 'Updated notes' });
      mockBillService.updateBill.mockResolvedValue(updatedBill);

      await updateBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.updateBill).toHaveBeenCalledWith(
        'bill-123',
        'org-123',
        { status: 'APPROVED', notes: 'Updated notes' },
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedBill,
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };

      await updateBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('approveBill', () => {
    it('should approve a bill', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };

      const approvedBill = createMockBill({ status: 'APPROVED' });
      mockBillService.approveBill.mockResolvedValue(approvedBill);

      await approveBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.approveBill).toHaveBeenCalledWith('bill-123', 'org-123', 'user-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: approvedBill,
        message: 'Bill approved successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };

      await approveBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('recordBillPayment', () => {
    it('should record a payment', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };
      mockRequest.body = { amount: 500 };

      const updatedBill = createMockBill({ paidAmount: 500, balanceAmount: 630 });
      mockBillService.recordPayment.mockResolvedValue(updatedBill);

      await recordBillPayment(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.recordPayment).toHaveBeenCalledWith(
        'bill-123',
        'org-123',
        500,
        'user-123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedBill,
        message: 'Payment recorded successfully',
      });
    });

    it('should throw ValidationError if amount is invalid', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };
      mockRequest.body = { amount: -100 };

      await recordBillPayment(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should throw ValidationError if amount is zero', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };
      mockRequest.body = { amount: 0 };

      await recordBillPayment(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };
      mockRequest.body = { amount: 500 };

      await recordBillPayment(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('deleteBill', () => {
    it('should delete a bill', async () => {
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };

      mockBillService.deleteBill.mockResolvedValue(undefined);

      await deleteBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.deleteBill).toHaveBeenCalledWith('bill-123', 'org-123', 'user-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Bill deleted successfully',
      });
    });

    it('should throw AuthenticationError if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { organizationId: 'org-123', billId: 'bill-123' };

      await deleteBill(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('getBillStats', () => {
    it('should get bill statistics', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = { vendorId: 'vendor-123' };

      const stats = {
        totalBills: 50,
        byStatus: { DRAFT: 10, APPROVED: 30, PAID: 10 },
        totalAmount: 100000,
        totalPaid: 75000,
        totalOutstanding: 25000,
        overdueCount: 5,
        overdueAmount: 5000,
      };
      mockBillService.getBillStats.mockResolvedValue(stats);

      await getBillStats(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.getBillStats).toHaveBeenCalledWith('org-123', 'vendor-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: stats,
      });
    });

    it('should get stats without vendor filter', async () => {
      mockRequest.params = { organizationId: 'org-123' };
      mockRequest.query = {};

      const stats = {
        totalBills: 100,
        byStatus: { DRAFT: 20, APPROVED: 60, PAID: 20 },
        totalAmount: 200000,
        totalPaid: 150000,
        totalOutstanding: 50000,
        overdueCount: 10,
        overdueAmount: 10000,
      };
      mockBillService.getBillStats.mockResolvedValue(stats);

      await getBillStats(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockBillService.getBillStats).toHaveBeenCalledWith('org-123', undefined);
    });
  });
});
