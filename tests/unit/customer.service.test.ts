import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { customerService } from '../../src/services/customer.service';
import { CustomerType, CustomerTier, CustomerStatus } from '../../src/types/enums';
import * as auditService from '../../src/services/audit.service';
import { prisma, createTestOrganization, createTestUser } from '../testUtils';

// Mock audit service to avoid FK constraint issues in tests
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logCreate: jest.fn(),
    logUpdate: jest.fn(),
    logView: jest.fn(),
    logDelete: jest.fn()
  }
}));

describe('CustomerService', () => {
  let testUser: any;
  let testOrganization: any;

  beforeEach(async () => {
    // Create test organization for user FK constraint
    testOrganization = await createTestOrganization('Test Org for Customer');

    // Create test user for audit FK constraint
    testUser = await createTestUser(testOrganization.id, 'test@customer-user.com');
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('createCustomer', () => {
    it('should create a person customer with valid data', async () => {
      const customerData = {
        type: CustomerType.PERSON,
        tier: CustomerTier.SMALL_BUSINESS,
        status: CustomerStatus.ACTIVE,
        notes: 'VIP customer',
        personData: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1-555-0123',
          mobile: '+1-555-0124'
        }
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const customer = await customerService.createCustomer(
        customerData,
        testOrganization.id,
        auditContext
      );

      expect(customer).toBeDefined();
      expect(customer.tier).toBe(CustomerTier.SMALL_BUSINESS);
      expect(customer.status).toBe(CustomerStatus.ACTIVE);
      expect(customer.notes).toBe('VIP customer');
      expect(customer.personId).toBeDefined();
      expect(customer.businessId).toBeNull();
      expect(customer.person).toBeDefined();
      expect(customer.person!.firstName).toBe('John');
      expect(customer.person!.lastName).toBe('Doe');
      // Email is encrypted, so just check it's defined
      expect(customer.person!.email).toBeDefined();
      expect(customerService.getCustomerType(customer)).toBe(CustomerType.PERSON);
    });

    it('should create a business customer with valid data', async () => {
      const customerData = {
        type: CustomerType.BUSINESS,
        tier: CustomerTier.ENTERPRISE,
        businessData: {
          legalName: 'Tech Solutions Inc.',
          tradeName: 'TechSol',
          businessNumber: 'BN123456789',
          taxNumber: 'HST987654321',
          email: 'info@techsol.com',
          phone: '+1-555-0456',
          website: 'https://techsol.com',
          businessType: 'CORPORATION'
        }
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const customer = await customerService.createCustomer(
        customerData,
        testOrganization.id,
        auditContext
      );

      expect(customer).toBeDefined();
      expect(customer.tier).toBe(CustomerTier.ENTERPRISE);
      expect(customer.status).toBe(CustomerStatus.PROSPECT); // default
      expect(customer.personId).toBeNull();
      expect(customer.businessId).toBeDefined();
      expect(customer.business).toBeDefined();
      expect(customer.business!.legalName).toBe('Tech Solutions Inc.');
      expect(customer.business!.tradeName).toBe('TechSol');
      expect(customer.business!.website).toBe('https://techsol.com');
      expect(customerService.getCustomerType(customer)).toBe(CustomerType.BUSINESS);
    });

    it('should set default tier when not provided', async () => {
      const customerData = {
        type: CustomerType.PERSON,
        personData: {
          firstName: 'Jane',
          lastName: 'Smith'
        }
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const customer = await customerService.createCustomer(
        customerData,
        testOrganization.id,
        auditContext
      );

      expect(customer.tier).toBe(CustomerTier.PERSONAL);
      expect(customer.status).toBe(CustomerStatus.PROSPECT);
    });

    it('should generate unique customer number', async () => {
      const customerData1 = {
        type: CustomerType.PERSON,
        personData: { firstName: 'First', lastName: 'Customer' }
      };

      const customerData2 = {
        type: CustomerType.PERSON,
        personData: { firstName: 'Second', lastName: 'Customer' }
      };

      const auditContext = { userId: testUser.id };

      const customer1 = await customerService.createCustomer(customerData1, testOrganization.id, auditContext);
      const customer2 = await customerService.createCustomer(customerData2, testOrganization.id, auditContext);

      expect(customer1.customerNumber).toBe('CUST-000001');
      expect(customer2.customerNumber).toBe('CUST-000002');
    });

    it('should call audit service', async () => {
      const customerData = {
        type: CustomerType.PERSON,
        personData: {
          firstName: 'Audit',
          lastName: 'Test'
        }
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      await customerService.createCustomer(
        customerData,
        testOrganization.id,
        auditContext
      );

      expect(auditService.auditService.logCreate).toHaveBeenCalled();
    });
  });

  describe('getCustomer', () => {
    let testPersonCustomer: any;
    let testBusinessCustomer: any;

    beforeEach(async () => {
      testPersonCustomer = await customerService.createCustomer(
        {
          type: CustomerType.PERSON,
          personData: {
            firstName: 'Get',
            lastName: 'Test'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      testBusinessCustomer = await customerService.createCustomer(
        {
          type: CustomerType.BUSINESS,
          businessData: {
            legalName: 'Get Test Business'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should retrieve person customer by id', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const customer = await customerService.getCustomer(
        testPersonCustomer.id,
        testOrganization.id,
        auditContext
      );

      expect(customer).toBeDefined();
      expect(customer!.id).toBe(testPersonCustomer.id);
      expect(customer!.personId).toBeDefined();
      expect(customer!.person).toBeDefined();
      expect(customer!.person!.firstName).toBe('Get');
      expect(customerService.getCustomerType(customer!)).toBe(CustomerType.PERSON);
    });

    it('should retrieve business customer by id', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const customer = await customerService.getCustomer(
        testBusinessCustomer.id,
        testOrganization.id,
        auditContext
      );

      expect(customer).toBeDefined();
      expect(customer!.id).toBe(testBusinessCustomer.id);
      expect(customer!.businessId).toBeDefined();
      expect(customer!.business).toBeDefined();
      expect(customer!.business!.legalName).toBe('Get Test Business');
      expect(customerService.getCustomerType(customer!)).toBe(CustomerType.BUSINESS);
    });

    it('should return null when customer not found', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const customer = await customerService.getCustomer(
        'non-existent-id',
        testOrganization.id,
        auditContext
      );

      expect(customer).toBeNull();
    });

    it('should call audit service for view action', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      await customerService.getCustomer(
        testPersonCustomer.id,
        testOrganization.id,
        auditContext
      );

      expect(auditService.auditService.logView).toHaveBeenCalled();
    });
  });

  describe('updateCustomer', () => {
    let testPersonCustomer: any;
    let testBusinessCustomer: any;

    beforeEach(async () => {
      testPersonCustomer = await customerService.createCustomer(
        {
          type: CustomerType.PERSON,
          tier: CustomerTier.PERSONAL,
          personData: {
            firstName: 'Update',
            lastName: 'Person',
            email: 'update@person.com'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      testBusinessCustomer = await customerService.createCustomer(
        {
          type: CustomerType.BUSINESS,
          tier: CustomerTier.SMALL_BUSINESS,
          businessData: {
            legalName: 'Update Business Inc.',
            email: 'update@business.com'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should update person customer data', async () => {
      const updateData = {
        tier: CustomerTier.ENTERPRISE,
        status: CustomerStatus.ACTIVE,
        notes: 'Upgraded customer',
        creditLimit: 5000,
        personData: {
          firstName: 'Updated',
          lastName: 'PersonName',
          email: 'updated@person.com',
          phone: '+1-555-9999'
        }
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const updatedCustomer = await customerService.updateCustomer(
        testPersonCustomer.id,
        updateData,
        testOrganization.id,
        auditContext
      );

      expect(updatedCustomer.tier).toBe(CustomerTier.ENTERPRISE);
      expect(updatedCustomer.status).toBe(CustomerStatus.ACTIVE);
      expect(updatedCustomer.notes).toBe('Upgraded customer');
      // creditLimit might be returned as string from database
      expect(Number(updatedCustomer.creditLimit)).toBe(5000);
      expect(updatedCustomer.person!.firstName).toBe('Updated');
      expect(updatedCustomer.person!.lastName).toBe('PersonName');
      // Email is encrypted, so just check it's defined
      expect(updatedCustomer.person!.email).toBeDefined();
      expect(updatedCustomer.person!.phone).toBeDefined();
    });

    it('should update business customer data', async () => {
      const updateData = {
        tier: CustomerTier.ENTERPRISE,
        status: CustomerStatus.ACTIVE,
        businessData: {
          legalName: 'Updated Business Corp.',
          tradeName: 'UpdBiz',
          website: 'https://updatedbiz.com',
          businessType: 'LLC'
        }
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const updatedCustomer = await customerService.updateCustomer(
        testBusinessCustomer.id,
        updateData,
        testOrganization.id,
        auditContext
      );

      expect(updatedCustomer.tier).toBe(CustomerTier.ENTERPRISE);
      expect(updatedCustomer.status).toBe(CustomerStatus.ACTIVE);
      expect(updatedCustomer.business!.legalName).toBe('Updated Business Corp.');
      expect(updatedCustomer.business!.tradeName).toBe('UpdBiz');
      expect(updatedCustomer.business!.website).toBe('https://updatedbiz.com');
      expect(updatedCustomer.business!.businessType).toBe('LLC');
    });

    it('should reject update when customer not found', async () => {
      const updateData = { tier: CustomerTier.ENTERPRISE };
      const auditContext = { userId: testUser.id };

      await expect(
        customerService.updateCustomer(
          'non-existent-id',
          updateData,
          testOrganization.id,
          auditContext
        )
      ).rejects.toThrow('Customer not found');
    });

    it('should call audit service for update action', async () => {
      const updateData = { tier: CustomerTier.ENTERPRISE };
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      await customerService.updateCustomer(
        testPersonCustomer.id,
        updateData,
        testOrganization.id,
        auditContext
      );

      expect(auditService.auditService.logUpdate).toHaveBeenCalled();
    });
  });

  describe('listCustomers', () => {
    beforeEach(async () => {
      // Create test customers
      await customerService.createCustomer(
        {
          type: CustomerType.PERSON,
          tier: CustomerTier.ENTERPRISE,
          status: CustomerStatus.ACTIVE,
          personData: {
            firstName: 'Alice',
            lastName: 'Johnson',
            email: 'alice@example.com'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await customerService.createCustomer(
        {
          type: CustomerType.BUSINESS,
          tier: CustomerTier.SMALL_BUSINESS,
          status: CustomerStatus.PROSPECT,
          businessData: {
            legalName: 'Corp Solutions Ltd.',
            email: 'corp@solutions.com'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await customerService.createCustomer(
        {
          type: CustomerType.PERSON,
          tier: CustomerTier.PERSONAL,
          status: CustomerStatus.INACTIVE,
          personData: {
            firstName: 'Bob',
            lastName: 'Wilson'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should list all customers', async () => {
      const result = await customerService.listCustomers({}, testOrganization.id);

      expect(result.customers).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by customer type', async () => {
      const result = await customerService.listCustomers(
        { type: CustomerType.PERSON },
        testOrganization.id
      );

      expect(result.customers).toHaveLength(2);
      expect(result.customers.every(c => c.personId !== null)).toBe(true);
    });

    it('should filter by tier', async () => {
      const result = await customerService.listCustomers(
        { tier: CustomerTier.ENTERPRISE },
        testOrganization.id
      );

      expect(result.customers).toHaveLength(1);
      expect(result.customers[0]!.tier).toBe(CustomerTier.ENTERPRISE);
    });

    it('should filter by status', async () => {
      const result = await customerService.listCustomers(
        { status: CustomerStatus.ACTIVE },
        testOrganization.id
      );

      expect(result.customers).toHaveLength(1);
      expect(result.customers[0]!.status).toBe(CustomerStatus.ACTIVE);
    });

    it('should search customers', async () => {
      const result = await customerService.listCustomers(
        { search: 'alice' },
        testOrganization.id
      );

      expect(result.customers).toHaveLength(1);
      expect(result.customers[0]!.person!.firstName).toBe('Alice');
    });

    it('should paginate results', async () => {
      const result = await customerService.listCustomers(
        { limit: 2, offset: 1 },
        testOrganization.id
      );

      expect(result.customers).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe('deleteCustomer', () => {
    let testCustomer: any;

    beforeEach(async () => {
      testCustomer = await customerService.createCustomer(
        {
          type: CustomerType.PERSON,
          personData: {
            firstName: 'Delete',
            lastName: 'Test'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should soft delete customer', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      const deletedCustomer = await customerService.deleteCustomer(
        testCustomer.id,
        testOrganization.id,
        auditContext
      );

      expect(deletedCustomer.status).toBe(CustomerStatus.ARCHIVED);
      expect(deletedCustomer.deletedAt).toBeDefined();
    });

    it('should reject delete when customer not found', async () => {
      const auditContext = { userId: testUser.id };

      await expect(
        customerService.deleteCustomer(
          'non-existent-id',
          testOrganization.id,
          auditContext
        )
      ).rejects.toThrow('Customer not found');
    });

    it('should call audit service for delete action', async () => {
      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1'
      };

      await customerService.deleteCustomer(
        testCustomer.id,
        testOrganization.id,
        auditContext
      );

      expect(auditService.auditService.logDelete).toHaveBeenCalled();
    });
  });

  describe('getCustomerStats', () => {
    let testCustomer: any;

    beforeEach(async () => {
      testCustomer = await customerService.createCustomer(
        {
          type: CustomerType.PERSON,
          personData: {
            firstName: 'Stats',
            lastName: 'Test'
          }
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should return customer statistics', async () => {
      const stats = await customerService.getCustomerStats(
        testCustomer.id,
        testOrganization.id
      );

      expect(stats).toBeDefined();
      expect(typeof stats.quotes).toBe('number');
      expect(typeof stats.invoices).toBe('number');
      expect(typeof stats.payments).toBe('number');
      expect(typeof stats.totalRevenue).toBe('number');
      expect(typeof stats.activeProjects).toBe('number');
    });

    it('should reject stats request when customer not found', async () => {
      await expect(
        customerService.getCustomerStats('non-existent-id', testOrganization.id)
      ).rejects.toThrow('Customer not found');
    });
  });

  describe('getCustomerType', () => {
    it('should return PERSON for customer with personId', () => {
      const customer = { personId: 'person-123', businessId: null } as any;
      expect(customerService.getCustomerType(customer)).toBe(CustomerType.PERSON);
    });

    it('should return BUSINESS for customer with businessId', () => {
      const customer = { personId: null, businessId: 'business-123' } as any;
      expect(customerService.getCustomerType(customer)).toBe(CustomerType.BUSINESS);
    });
  });
});