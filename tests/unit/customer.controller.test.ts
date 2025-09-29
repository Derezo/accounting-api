// Mock Prisma and services first
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    customer: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn()
    }
  }))
}));

jest.mock('../../src/services/customer.service', () => ({
  customerService: {
    createCustomer: jest.fn(),
    getCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    listCustomers: jest.fn(),
    deleteCustomer: jest.fn(),
    getCustomerStats: jest.fn(),
    getCustomerType: jest.fn()
  }
}));

jest.mock('../../src/services/audit.service');
jest.mock('../../src/utils/response');

// Mock express-validator
jest.mock('express-validator', () => ({
  validationResult: jest.fn(() => ({
    isEmpty: jest.fn(() => true),
    array: jest.fn(() => [])
  })),
  body: jest.fn(() => ({
    isIn: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    optional: jest.fn(() => ({
      isIn: jest.fn(() => ({})),
      trim: jest.fn(() => ({})),
      isArray: jest.fn(() => ({})),
      notEmpty: jest.fn(() => ({ trim: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })) })),
      isEmail: jest.fn(() => ({ normalizeEmail: jest.fn(() => ({})) })),
      isISO8601: jest.fn(() => ({})),
      isURL: jest.fn(() => ({})),
      isBoolean: jest.fn(() => ({}))
    })),
    notEmpty: jest.fn(() => ({ trim: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })) })),
    trim: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    isEmail: jest.fn(() => ({ normalizeEmail: jest.fn(() => ({})) })),
    isISO8601: jest.fn(() => ({})),
    isURL: jest.fn(() => ({})),
    isBoolean: jest.fn(() => ({})),
    withMessage: jest.fn(() => ({})),
    if: jest.fn(() => ({
      notEmpty: jest.fn(() => ({ trim: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })) })),
      equals: jest.fn(() => ({}))
    })),
    equals: jest.fn(() => ({}))
  })),
  query: jest.fn(() => ({
    optional: jest.fn(() => ({
      isIn: jest.fn(() => ({})),
      trim: jest.fn(() => ({})),
      isInt: jest.fn(() => ({}))
    }))
  }))
}));

import { Request, Response } from 'express';
import { customerController } from '../../src/controllers/customer.controller';
import { customerService } from '../../src/services/customer.service';
import { CustomerType, CustomerTier, CustomerStatus, UserRole } from '../../src/types/enums';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';
import {
  sendSuccess,
  sendError,
  sendValidationError,
  sendUnauthorized,
  sendNotFound,
  sendInternalError,
  calculatePagination
} from '../../src/utils/response';
import { validationResult } from 'express-validator';

// Mock response utilities
const mockSendSuccess = sendSuccess as jest.MockedFunction<typeof sendSuccess>;
const mockSendError = sendError as jest.MockedFunction<typeof sendError>;
const mockSendValidationError = sendValidationError as jest.MockedFunction<typeof sendValidationError>;
const mockSendUnauthorized = sendUnauthorized as jest.MockedFunction<typeof sendUnauthorized>;
const mockSendNotFound = sendNotFound as jest.MockedFunction<typeof sendNotFound>;
const mockSendInternalError = sendInternalError as jest.MockedFunction<typeof sendInternalError>;
const mockCalculatePagination = calculatePagination as jest.MockedFunction<typeof calculatePagination>;

// Mock customer service
const mockCustomerService = customerService as jest.Mocked<typeof customerService>;
const mockValidationResult = validationResult as jest.MockedFunction<typeof validationResult>;

describe('CustomerController', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';

  // Test data
  const mockPersonCustomer = {
    id: 'customer-123',
    customerNumber: 'CUST-001',
    type: CustomerType.PERSON,
    tier: CustomerTier.PERSONAL,
    status: CustomerStatus.ACTIVE,
    notes: 'Test customer notes',
    creditLimit: 5000,
    paymentTerms: 30,
    taxExempt: false,
    preferredCurrency: 'CAD',
    organizationId: mockOrganizationId,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    person: {
      id: 'person-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@email.com',
      phone: '+1-555-123-4567',
      dateOfBirth: new Date('1985-06-15')
    },
    business: null,
    addresses: []
  };

  const mockBusinessCustomer = {
    id: 'customer-456',
    customerNumber: 'CUST-002',
    type: CustomerType.BUSINESS,
    tier: CustomerTier.SMALL_BUSINESS,
    status: CustomerStatus.ACTIVE,
    notes: 'Business customer notes',
    creditLimit: 25000,
    paymentTerms: 15,
    taxExempt: false,
    preferredCurrency: 'CAD',
    organizationId: mockOrganizationId,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    person: null,
    business: {
      id: 'business-123',
      legalName: 'Acme Corp Inc.',
      tradingName: 'Acme Corp',
      businessNumber: '123456789RC0001',
      email: 'info@acme.com',
      phone: '+1-555-987-6543'
    },
    addresses: []
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      user: {
        id: mockUserId,
        organizationId: mockOrganizationId,
        role: UserRole.ADMIN,
        sessionId: 'session-123'
      },
      params: {
        organizationId: mockOrganizationId
      },
      body: {},
      query: {},
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      }
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Default validation result mock
    mockValidationResult.mockReturnValue({
      isEmpty: () => true,
      array: () => []
    } as any);
  });

  describe('createCustomer', () => {
    const validPersonRequest = {
      type: CustomerType.PERSON,
      tier: CustomerTier.PERSONAL,
      creditLimit: 5000,
      paymentTerms: 30,
      person: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@email.com',
        phone: '+1-555-123-4567'
      }
    };

    const validBusinessRequest = {
      type: CustomerType.BUSINESS,
      tier: CustomerTier.SMALL_BUSINESS,
      creditLimit: 25000,
      paymentTerms: 15,
      business: {
        legalName: 'Acme Corp Inc.',
        businessNumber: '123456789RC0001',
        email: 'info@acme.com',
        phone: '+1-555-987-6543'
      }
    };

    it('should create a PERSON customer successfully', async () => {
      mockRequest.body = validPersonRequest;
      mockCustomerService.createCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
        {
          type: CustomerType.PERSON,
          tier: CustomerTier.PERSONAL,
          creditLimit: 5000,
          paymentTerms: 30,
          personData: validPersonRequest.person,
          businessData: undefined,
          address: undefined,
          status: undefined,
          notes: undefined,
          taxExempt: undefined,
          preferredCurrency: undefined
        },
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );

      expect(mockSendSuccess).toHaveBeenCalledWith(
        mockResponse,
        {
          message: 'Customer created successfully',
          customer: {
            id: mockPersonCustomer.id,
            customerNumber: mockPersonCustomer.customerNumber,
            type: CustomerType.PERSON,
            tier: mockPersonCustomer.tier,
            status: mockPersonCustomer.status,
            createdAt: mockPersonCustomer.createdAt,
            person: mockPersonCustomer.person,
            business: mockPersonCustomer.business
          }
        },
        201
      );
    });

    it('should create a BUSINESS customer successfully', async () => {
      mockRequest.body = validBusinessRequest;
      mockCustomerService.createCustomer.mockResolvedValue(mockBusinessCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.BUSINESS);

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
        {
          type: CustomerType.BUSINESS,
          tier: CustomerTier.SMALL_BUSINESS,
          creditLimit: 25000,
          paymentTerms: 15,
          personData: undefined,
          businessData: validBusinessRequest.business,
          address: undefined,
          status: undefined,
          notes: undefined,
          taxExempt: undefined,
          preferredCurrency: undefined
        },
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );

      expect(mockSendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Customer created successfully',
          customer: expect.objectContaining({
            type: CustomerType.BUSINESS
          })
        }),
        201
      );
    });

    it('should handle validation errors', async () => {
      const validationErrors = [
        { field: 'type', message: 'Valid customer type is required' }
      ];

      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      } as any);

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendValidationError).toHaveBeenCalledWith(mockResponse, validationErrors);
      expect(mockCustomerService.createCustomer).not.toHaveBeenCalled();
    });

    it('should handle unauthenticated requests', async () => {
      mockRequest.user = undefined;

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendUnauthorized).toHaveBeenCalledWith(mockResponse);
      expect(mockCustomerService.createCustomer).not.toHaveBeenCalled();
    });

    it('should use organizationId from JWT when not in URL params', async () => {
      mockRequest.params = {};
      mockRequest.body = validPersonRequest;
      mockCustomerService.createCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
        expect.anything(),
        mockOrganizationId, // Should use organizationId from JWT
        expect.anything()
      );
    });

    it('should handle service errors', async () => {
      mockRequest.body = validPersonRequest;
      const errorMessage = 'Database connection failed';
      mockCustomerService.createCustomer.mockRejectedValue(new Error(errorMessage));

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendInternalError).toHaveBeenCalledWith(mockResponse, errorMessage);
    });

    it('should handle missing user agent and IP', async () => {
      mockRequest.body = validPersonRequest;
      // Create a new request without ip to test the fallback
      const requestWithoutIp = {
        ...mockRequest,
        ip: undefined,
        headers: {}
      };
      mockCustomerService.createCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.createCustomer(requestWithoutIp as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
        expect.anything(),
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: 'unknown',
          userAgent: 'unknown'
        }
      );
    });
  });

  describe('getCustomer', () => {
    it('should retrieve customer successfully', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockCustomerService.getCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.getCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.getCustomer).toHaveBeenCalledWith(
        'customer-123',
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        customer: {
          id: mockPersonCustomer.id,
          customerNumber: mockPersonCustomer.customerNumber,
          type: CustomerType.PERSON,
          tier: mockPersonCustomer.tier,
          status: mockPersonCustomer.status,
          notes: mockPersonCustomer.notes,
          creditLimit: mockPersonCustomer.creditLimit,
          paymentTerms: mockPersonCustomer.paymentTerms,
          taxExempt: mockPersonCustomer.taxExempt,
          preferredCurrency: mockPersonCustomer.preferredCurrency,
          createdAt: mockPersonCustomer.createdAt,
          updatedAt: mockPersonCustomer.updatedAt,
          person: mockPersonCustomer.person,
          business: mockPersonCustomer.business,
          addresses: mockPersonCustomer.addresses,
          stats: undefined
        }
      });
    });

    it('should handle unauthenticated requests', async () => {
      mockRequest.user = undefined;

      await customerController.getCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockCustomerService.getCustomer).not.toHaveBeenCalled();
    });

    it('should handle customer not found', async () => {
      mockRequest.params = { id: 'non-existent', organizationId: mockOrganizationId };
      mockCustomerService.getCustomer.mockResolvedValue(null);

      await customerController.getCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      const errorMessage = 'Database error';
      mockCustomerService.getCustomer.mockRejectedValue(new Error(errorMessage));

      await customerController.getCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: errorMessage });
    });

    it('should use organizationId from JWT when not in URL params', async () => {
      mockRequest.params = { id: 'customer-123' };
      mockCustomerService.getCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.getCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.getCustomer).toHaveBeenCalledWith(
        'customer-123',
        mockOrganizationId, // Should use organizationId from JWT
        expect.anything()
      );
    });
  });

  describe('updateCustomer', () => {
    const updateData = {
      tier: CustomerTier.ENTERPRISE,
      creditLimit: 10000,
      paymentTerms: 45,
      personData: {
        email: 'john.updated@email.com',
        phone: '+1-555-999-8888'
      }
    };

    it('should update customer successfully', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockRequest.body = updateData;

      const updatedCustomer = { ...mockPersonCustomer, ...updateData };
      mockCustomerService.updateCustomer.mockResolvedValue(updatedCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.updateCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.updateCustomer).toHaveBeenCalledWith(
        'customer-123',
        updateData,
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Customer updated successfully',
        customer: expect.objectContaining({
          id: 'customer-123',
          type: CustomerType.PERSON
        })
      });
    });

    it('should handle validation errors', async () => {
      const validationErrors = [
        { field: 'tier', message: 'Invalid customer tier' }
      ];

      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      } as any);

      await customerController.updateCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ errors: validationErrors });
      expect(mockCustomerService.updateCustomer).not.toHaveBeenCalled();
    });

    it('should handle unauthenticated requests', async () => {
      mockRequest.user = undefined;

      await customerController.updateCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockCustomerService.updateCustomer).not.toHaveBeenCalled();
    });

    it('should handle customer not found error', async () => {
      mockRequest.params = { id: 'non-existent', organizationId: mockOrganizationId };
      mockRequest.body = updateData;
      mockCustomerService.updateCustomer.mockRejectedValue(new Error('Customer not found'));

      await customerController.updateCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });

    it('should handle other service errors', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockRequest.body = updateData;
      const errorMessage = 'Database connection failed';
      mockCustomerService.updateCustomer.mockRejectedValue(new Error(errorMessage));

      await customerController.updateCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: errorMessage });
    });
  });

  describe('listCustomers', () => {
    const mockCustomersResult = {
      customers: [mockPersonCustomer, mockBusinessCustomer],
      total: 2
    };

    const mockPagination = {
      page: 1,
      limit: 50,
      total: 2,
      totalPages: 1
    };

    it('should list customers successfully with default pagination', async () => {
      mockCustomerService.listCustomers.mockResolvedValue(mockCustomersResult as any);
      mockCustomerService.getCustomerType
        .mockReturnValueOnce(CustomerType.PERSON)
        .mockReturnValueOnce(CustomerType.BUSINESS);
      mockCalculatePagination.mockReturnValue(mockPagination);

      await customerController.listCustomers(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.listCustomers).toHaveBeenCalledWith(
        {
          type: undefined,
          tier: undefined,
          status: undefined,
          search: undefined,
          limit: undefined,
          offset: undefined
        },
        mockOrganizationId
      );

      expect(mockCalculatePagination).toHaveBeenCalledWith(2, 50, 0);
      expect(mockSendSuccess).toHaveBeenCalledWith(
        mockResponse,
        {
          customers: expect.arrayContaining([
            expect.objectContaining({ type: CustomerType.PERSON }),
            expect.objectContaining({ type: CustomerType.BUSINESS })
          ])
        },
        200,
        mockPagination
      );
    });

    it('should list customers with filters and pagination', async () => {
      mockRequest.query = {
        type: CustomerType.BUSINESS,
        tier: CustomerTier.SMALL_BUSINESS,
        status: CustomerStatus.ACTIVE,
        search: 'Acme',
        limit: '10',
        offset: '20'
      };

      mockCustomerService.listCustomers.mockResolvedValue(mockCustomersResult as any);
      mockCustomerService.getCustomerType
        .mockReturnValueOnce(CustomerType.PERSON)
        .mockReturnValueOnce(CustomerType.BUSINESS);
      mockCalculatePagination.mockReturnValue(mockPagination);

      await customerController.listCustomers(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.listCustomers).toHaveBeenCalledWith(
        {
          type: CustomerType.BUSINESS,
          tier: CustomerTier.SMALL_BUSINESS,
          status: CustomerStatus.ACTIVE,
          search: 'Acme',
          limit: 10,
          offset: 20
        },
        mockOrganizationId
      );

      expect(mockCalculatePagination).toHaveBeenCalledWith(2, 10, 20);
    });

    it('should handle validation errors', async () => {
      const validationErrors = [
        { field: 'limit', message: 'Limit must be between 1 and 100' }
      ];

      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      } as any);

      await customerController.listCustomers(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendValidationError).toHaveBeenCalledWith(mockResponse, validationErrors);
      expect(mockCustomerService.listCustomers).not.toHaveBeenCalled();
    });

    it('should handle unauthenticated requests', async () => {
      mockRequest.user = undefined;

      await customerController.listCustomers(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendUnauthorized).toHaveBeenCalledWith(mockResponse);
      expect(mockCustomerService.listCustomers).not.toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      const emptyResult = { customers: [], total: 0 };
      mockCustomerService.listCustomers.mockResolvedValue(emptyResult as any);
      mockCalculatePagination.mockReturnValue({ ...mockPagination, total: 0, totalPages: 0 });

      await customerController.listCustomers(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        mockResponse,
        { customers: [] },
        200,
        expect.objectContaining({ total: 0 })
      );
    });

    it('should handle service errors', async () => {
      const errorMessage = 'Database query failed';
      mockCustomerService.listCustomers.mockRejectedValue(new Error(errorMessage));

      await customerController.listCustomers(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendInternalError).toHaveBeenCalledWith(mockResponse, errorMessage);
    });
  });

  describe('deleteCustomer', () => {
    const deletedCustomer = {
      ...mockPersonCustomer,
      status: CustomerStatus.INACTIVE,
      deletedAt: new Date('2024-01-15T10:30:00.000Z')
    };

    it('should delete customer successfully', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockCustomerService.deleteCustomer.mockResolvedValue(deletedCustomer as any);

      await customerController.deleteCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.deleteCustomer).toHaveBeenCalledWith(
        'customer-123',
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Customer deleted successfully',
        customer: {
          id: deletedCustomer.id,
          status: deletedCustomer.status,
          deletedAt: deletedCustomer.deletedAt
        }
      });
    });

    it('should handle unauthenticated requests', async () => {
      mockRequest.user = undefined;

      await customerController.deleteCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockCustomerService.deleteCustomer).not.toHaveBeenCalled();
    });

    it('should handle customer not found error', async () => {
      mockRequest.params = { id: 'non-existent', organizationId: mockOrganizationId };
      mockCustomerService.deleteCustomer.mockRejectedValue(new Error('Customer not found'));

      await customerController.deleteCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });

    it('should handle customer deletion conflicts', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockCustomerService.deleteCustomer.mockRejectedValue(
        new Error('Cannot delete customer with active invoices')
      );

      await customerController.deleteCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Cannot delete customer with active invoices'
      });
    });

    it('should handle other service errors', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      const errorMessage = 'Database connection failed';
      mockCustomerService.deleteCustomer.mockRejectedValue(new Error(errorMessage));

      await customerController.deleteCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: errorMessage });
    });
  });

  describe('getCustomerStats', () => {
    const mockStats = {
      quotes: 5,
      invoices: 3,
      payments: 2,
      totalRevenue: 15000,
      activeProjects: 1
    };

    it('should retrieve customer stats successfully', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockCustomerService.getCustomerStats.mockResolvedValue(mockStats);

      await customerController.getCustomerStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.getCustomerStats).toHaveBeenCalledWith(
        'customer-123',
        mockOrganizationId
      );

      expect(mockResponse.json).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should handle unauthenticated requests', async () => {
      mockRequest.user = undefined;

      await customerController.getCustomerStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockCustomerService.getCustomerStats).not.toHaveBeenCalled();
    });

    it('should handle customer not found error', async () => {
      mockRequest.params = { id: 'non-existent', organizationId: mockOrganizationId };
      mockCustomerService.getCustomerStats.mockRejectedValue(new Error('Customer not found'));

      await customerController.getCustomerStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      const errorMessage = 'Database query failed';
      mockCustomerService.getCustomerStats.mockRejectedValue(new Error(errorMessage));

      await customerController.getCustomerStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: errorMessage });
    });

    it('should use organizationId from JWT when not in URL params', async () => {
      mockRequest.params = { id: 'customer-123' };
      mockCustomerService.getCustomerStats.mockResolvedValue(mockStats);

      await customerController.getCustomerStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.getCustomerStats).toHaveBeenCalledWith(
        'customer-123',
        mockOrganizationId // Should use organizationId from JWT
      );
    });
  });

  describe('Multi-tenant isolation tests', () => {
    const differentOrgId = 'different-org-456';

    it('should prevent cross-tenant access in getCustomer', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: differentOrgId };
      mockCustomerService.getCustomer.mockResolvedValue(null); // Customer not found in different org

      await customerController.getCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.getCustomer).toHaveBeenCalledWith(
        'customer-123',
        differentOrgId, // Should use the org from URL params
        expect.anything()
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });

    it('should prevent cross-tenant access in updateCustomer', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: differentOrgId };
      mockRequest.body = { notes: 'Updated notes' };
      mockCustomerService.updateCustomer.mockRejectedValue(new Error('Customer not found'));

      await customerController.updateCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.updateCustomer).toHaveBeenCalledWith(
        'customer-123',
        { notes: 'Updated notes' },
        differentOrgId, // Should use the org from URL params
        expect.anything()
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should prevent cross-tenant access in deleteCustomer', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: differentOrgId };
      mockCustomerService.deleteCustomer.mockRejectedValue(new Error('Customer not found'));

      await customerController.deleteCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.deleteCustomer).toHaveBeenCalledWith(
        'customer-123',
        differentOrgId, // Should use the org from URL params
        expect.anything()
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Role-based access control', () => {
    it('should allow ADMIN to create customers', async () => {
      mockRequest.user!.role = UserRole.ADMIN;
      mockRequest.body = {
        type: CustomerType.PERSON,
        person: { firstName: 'John', lastName: 'Doe' }
      };
      mockCustomerService.createCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.createCustomer).toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('should allow ACCOUNTANT to access customer data', async () => {
      mockRequest.user!.role = UserRole.ACCOUNTANT;
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockCustomerService.getCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.getCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.getCustomer).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should allow VIEWER to access customer stats', async () => {
      mockRequest.user!.role = UserRole.VIEWER;
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      const mockStats = { quotes: 1, invoices: 1, payments: 1, totalRevenue: 1000, activeProjects: 0 };
      mockCustomerService.getCustomerStats.mockResolvedValue(mockStats);

      await customerController.getCustomerStats(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.getCustomerStats).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({ stats: mockStats });
    });
  });

  describe('Input validation edge cases', () => {
    it('should handle malformed customer type in createCustomer', async () => {
      const validationErrors = [
        { field: 'type', message: 'Valid customer type is required' }
      ];

      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      } as any);

      mockRequest.body = { type: 'INVALID_TYPE' };

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendValidationError).toHaveBeenCalledWith(mockResponse, validationErrors);
      expect(mockCustomerService.createCustomer).not.toHaveBeenCalled();
    });

    it('should handle missing required fields for PERSON type', async () => {
      const validationErrors = [
        { field: 'person.firstName', message: 'First name is required for person' },
        { field: 'person.lastName', message: 'Last name is required for person' }
      ];

      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      } as any);

      mockRequest.body = { type: CustomerType.PERSON, person: {} };

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendValidationError).toHaveBeenCalledWith(mockResponse, validationErrors);
    });

    it('should handle missing required fields for BUSINESS type', async () => {
      const validationErrors = [
        { field: 'businessData.legalName', message: 'Legal name is required for business' }
      ];

      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      } as any);

      mockRequest.body = { type: CustomerType.BUSINESS, business: {} };

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendValidationError).toHaveBeenCalledWith(mockResponse, validationErrors);
    });

    it('should handle invalid email format', async () => {
      const validationErrors = [
        { field: 'person.email', message: 'Invalid email format' }
      ];

      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      } as any);

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockSendValidationError).toHaveBeenCalledWith(mockResponse, validationErrors);
    });
  });

  describe('Audit trail validation', () => {
    it('should pass correct audit context to createCustomer', async () => {
      mockRequest.body = {
        type: CustomerType.PERSON,
        person: { firstName: 'John', lastName: 'Doe' }
      };
      mockCustomerService.createCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.createCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
        expect.anything(),
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );
    });

    it('should pass correct audit context to updateCustomer', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      mockRequest.body = { notes: 'Updated' };
      mockCustomerService.updateCustomer.mockResolvedValue(mockPersonCustomer as any);
      mockCustomerService.getCustomerType.mockReturnValue(CustomerType.PERSON);

      await customerController.updateCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.updateCustomer).toHaveBeenCalledWith(
        'customer-123',
        { notes: 'Updated' },
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );
    });

    it('should pass correct audit context to deleteCustomer', async () => {
      mockRequest.params = { id: 'customer-123', organizationId: mockOrganizationId };
      const deletedCustomer = { ...mockPersonCustomer, deletedAt: new Date() };
      mockCustomerService.deleteCustomer.mockResolvedValue(deletedCustomer as any);

      await customerController.deleteCustomer(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockCustomerService.deleteCustomer).toHaveBeenCalledWith(
        'customer-123',
        mockOrganizationId,
        {
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      );
    });
  });
});