import { Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { customerService } from '../services/customer.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { CustomerType, CustomerTier, CustomerStatus } from '../types/enums';

export const validateCreateCustomer = [
  body('type').isIn(Object.values(CustomerType)).withMessage('Valid customer type is required'),
  body('tier').optional().isIn(Object.values(CustomerTier)),
  body('notes').optional().trim(),
  body('tags').optional().isArray(),
  body('personData.firstName').if(body('type').equals(CustomerType.PERSON)).notEmpty().trim().withMessage('First name is required for person'),
  body('personData.lastName').if(body('type').equals(CustomerType.PERSON)).notEmpty().trim().withMessage('Last name is required for person'),
  body('personData.email').optional().isEmail().normalizeEmail(),
  body('personData.phone').optional().trim(),
  body('personData.dateOfBirth').optional().isISO8601(),
  body('personData.preferredName').optional().trim(),
  body('businessData.legalName').if(body('type').equals(CustomerType.BUSINESS)).notEmpty().trim().withMessage('Legal name is required for business'),
  body('businessData.tradingName').optional().trim(),
  body('businessData.businessNumber').optional().trim(),
  body('businessData.taxNumber').optional().trim(),
  body('businessData.email').optional().isEmail().normalizeEmail(),
  body('businessData.phone').optional().trim(),
  body('businessData.website').optional().isURL(),
  body('businessData.industry').optional().trim(),
  body('address.street').optional().trim(),
  body('address.city').optional().trim(),
  body('address.state').optional().trim(),
  body('address.postalCode').optional().trim(),
  body('address.country').optional().trim(),
  body('address.type').optional().trim()
];

export const validateUpdateCustomer = [
  body('tier').optional().isIn(Object.values(CustomerTier)),
  body('notes').optional().trim(),
  body('tags').optional().isArray(),
  body('isActive').optional().isBoolean(),
  body('personData.firstName').optional().notEmpty().trim(),
  body('personData.lastName').optional().notEmpty().trim(),
  body('personData.email').optional().isEmail().normalizeEmail(),
  body('personData.phone').optional().trim(),
  body('personData.dateOfBirth').optional().isISO8601(),
  body('personData.preferredName').optional().trim(),
  body('businessData.legalName').optional().notEmpty().trim(),
  body('businessData.tradingName').optional().trim(),
  body('businessData.businessNumber').optional().trim(),
  body('businessData.taxNumber').optional().trim(),
  body('businessData.email').optional().isEmail().normalizeEmail(),
  body('businessData.phone').optional().trim(),
  body('businessData.website').optional().isURL(),
  body('businessData.industry').optional().trim()
];

export const validateListCustomers = [
  query('type').optional().isIn(Object.values(CustomerType)),
  query('tier').optional().isIn(Object.values(CustomerTier)),
  query('status').optional().isIn(Object.values(CustomerStatus)),
  query('search').optional().trim(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
];

export class CustomerController {
  async createCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const customer = await customerService.createCustomer(
        req.body,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Customer created successfully',
        customer: {
          id: customer.id,
          customerNumber: customer.customerNumber,
          type: customerService.getCustomerType(customer),
          tier: customer.tier,
          status: customer.status,
          createdAt: customer.createdAt,
          person: customer.person,
          business: customer.business
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const customer = await customerService.getCustomer(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      res.json({
        customer: {
          id: customer.id,
          customerNumber: customer.customerNumber,
          type: customerService.getCustomerType(customer),
          tier: customer.tier,
          status: customer.status,
          notes: customer.notes,
          creditLimit: customer.creditLimit,
          paymentTerms: customer.paymentTerms,
          taxExempt: customer.taxExempt,
          preferredCurrency: customer.preferredCurrency,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          person: customer.person,
          business: customer.business,
          addresses: customer.addresses,
          stats: (customer as any)._count
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const customer = await customerService.updateCustomer(
        req.params.id!,
        req.body,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Customer updated successfully',
        customer: {
          id: customer.id,
          customerNumber: customer.customerNumber,
          type: customerService.getCustomerType(customer),
          tier: customer.tier,
          status: customer.status,
          notes: customer.notes,
          creditLimit: customer.creditLimit,
          paymentTerms: customer.paymentTerms,
          taxExempt: customer.taxExempt,
          preferredCurrency: customer.preferredCurrency,
          updatedAt: customer.updatedAt,
          person: customer.person,
          business: customer.business
        }
      });
    } catch (error: any) {
      if (error.message === 'Customer not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async listCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const filters = {
        type: req.query.type as CustomerType,
        tier: req.query.tier as CustomerTier,
        status: req.query.status as CustomerStatus,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await customerService.listCustomers(filters, req.user.organizationId);

      res.json({
        customers: result.customers.map(customer => ({
          id: customer.id,
          customerNumber: customer.customerNumber,
          type: customerService.getCustomerType(customer),
          tier: customer.tier,
          status: customer.status,
          notes: customer.notes,
          creditLimit: customer.creditLimit,
          paymentTerms: customer.paymentTerms,
          taxExempt: customer.taxExempt,
          preferredCurrency: customer.preferredCurrency,
          createdAt: customer.createdAt,
          person: customer.person,
          business: customer.business,
          stats: (customer as any)._count
        })),
        pagination: {
          total: result.total,
          limit: filters.limit || 50,
          offset: filters.offset || 0
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const customer = await customerService.deleteCustomer(
        req.params.id!,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Customer deleted successfully',
        customer: {
          id: customer.id,
          status: customer.status,
          deletedAt: customer.deletedAt
        }
      });
    } catch (error: any) {
      if (error.message === 'Customer not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot delete customer')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getCustomerStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const stats = await customerService.getCustomerStats(
        req.params.id!,
        req.user.organizationId
      );

      res.json({ stats });
    } catch (error: any) {
      if (error.message === 'Customer not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
}

export const customerController = new CustomerController();