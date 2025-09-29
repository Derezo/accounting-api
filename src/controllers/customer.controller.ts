import { Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { customerService } from '../services/customer.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { CustomerType, CustomerTier, CustomerStatus } from '../types/enums';
import {
  sendSuccess,
  sendError,
  sendValidationError,
  sendUnauthorized,
  sendNotFound,
  sendInternalError,
  calculatePagination
} from '../utils/response';

export const validateCreateCustomer = [
  body('type').isIn(Object.values(CustomerType)).withMessage('Valid customer type is required'),
  body('tier').optional().isIn(Object.values(CustomerTier)),
  body('notes').optional().trim(),
  body('tags').optional().isArray(),
  body('person.firstName').if(body('type').equals(CustomerType.PERSON)).notEmpty().trim().withMessage('First name is required for person'),
  body('person.lastName').if(body('type').equals(CustomerType.PERSON)).notEmpty().trim().withMessage('Last name is required for person'),
  body('person.email').optional().isEmail().normalizeEmail(),
  body('person.phone').optional().trim(),
  body('person.dateOfBirth').optional().isISO8601(),
  body('person.preferredName').optional().trim(),
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

/**
 * Customer management controller
 * Handles all customer-related operations with multi-tenant isolation
 */
export class CustomerController {

  /**
   * @swagger
   * /organizations/{organizationId}/customers:
   *   post:
   *     tags: [Customers]
   *     summary: Create a new customer
   *     description: |
   *       Create a new customer for the organization. Supports both person and business customers
   *       with proper multi-tenant isolation and audit logging.
   *     parameters:
   *       - $ref: '#/components/parameters/OrganizationId'
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [PERSON, BUSINESS]
   *                 description: Customer type
   *                 example: "PERSON"
   *               tier:
   *                 $ref: '#/components/schemas/CustomerTier'
   *               status:
   *                 $ref: '#/components/schemas/CustomerStatus'
   *               creditLimit:
   *                 type: number
   *                 format: decimal
   *                 description: Customer credit limit
   *                 example: 5000.00
   *               paymentTerms:
   *                 type: integer
   *                 description: Payment terms in days
   *                 example: 15
   *               taxExempt:
   *                 type: boolean
   *                 description: Tax exemption status
   *                 default: false
   *               preferredCurrency:
   *                 $ref: '#/components/schemas/Currency'
   *               notes:
   *                 type: string
   *                 description: Internal notes
   *                 example: "Preferred customer"
   *               person:
   *                 type: object
   *                 description: Person details (required if type is PERSON)
   *                 properties:
   *                   firstName:
   *                     type: string
   *                     example: "John"
   *                   lastName:
   *                     type: string
   *                     example: "Doe"
   *                   email:
   *                     type: string
   *                     format: email
   *                     example: "john.doe@email.com"
   *                   phone:
   *                     type: string
   *                     example: "+1-555-123-4567"
   *                   dateOfBirth:
   *                     type: string
   *                     format: date
   *                     example: "1985-06-15"
   *               business:
   *                 type: object
   *                 description: Business details (required if type is BUSINESS)
   *                 properties:
   *                   legalName:
   *                     type: string
   *                     example: "Acme Corp Inc."
   *                   tradingName:
   *                     type: string
   *                     example: "Acme Corp"
   *                   businessNumber:
   *                     type: string
   *                     example: "123456789RC0001"
   *                   email:
   *                     type: string
   *                     format: email
   *                     example: "info@acme.com"
   *                   phone:
   *                     type: string
   *                     example: "+1-555-987-6543"
   *             required: [type]
   *           examples:
   *             PersonCustomer:
   *               summary: Person customer example
   *               value:
   *                 type: "PERSON"
   *                 tier: "PERSONAL"
   *                 person:
   *                   firstName: "John"
   *                   lastName: "Doe"
   *                   email: "john.doe@email.com"
   *                   phone: "+1-555-123-4567"
   *                 creditLimit: 2000.00
   *                 paymentTerms: 15
   *             BusinessCustomer:
   *               summary: Business customer example
   *               value:
   *                 type: "BUSINESS"
   *                 tier: "SMALL_BUSINESS"
   *                 business:
   *                   legalName: "Smith Construction Ltd."
   *                   businessNumber: "987654321RC0001"
   *                   email: "info@smithconstruction.com"
   *                   phone: "+1-555-987-6543"
   *                 creditLimit: 10000.00
   *                 paymentTerms: 30
   *     responses:
   *       '201':
   *         description: Customer created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 customer:
   *                   $ref: '#/components/schemas/Customer'
   *                 message:
   *                   type: string
   *                   example: "Customer created successfully"
   *       '400':
   *         $ref: '#/components/responses/ValidationError'
   *       '401':
   *         $ref: '#/components/responses/AuthenticationError'
   *       '403':
   *         $ref: '#/components/responses/AuthorizationError'
   *       '409':
   *         description: Customer already exists
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ConflictError'
   *       '429':
   *         $ref: '#/components/responses/RateLimitError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
  async createCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendValidationError(res, errors.array());
        return;
      }

      if (!req.user) {
        sendUnauthorized(res);
        return;
      }

      // Map request data to service format
      const createData = {
        type: req.body.type,
        tier: req.body.tier,
        status: req.body.status,
        notes: req.body.notes,
        creditLimit: req.body.creditLimit,
        paymentTerms: req.body.paymentTerms,
        taxExempt: req.body.taxExempt,
        preferredCurrency: req.body.preferredCurrency,
        personData: req.body.person,
        businessData: req.body.business,
        address: req.body.address
      };

      // Use organizationId from URL (preferred) or JWT (fallback for backward compatibility)
      const organizationId = req.params.organizationId || req.user.organizationId;

      const customer = await customerService.createCustomer(
        createData,
        organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown'
        }
      );

      const responseData = {
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
      };

      sendSuccess(res, responseData, 201);
    } catch (error: any) {
      sendInternalError(res, error.message);
    }
  }

  /**
   * @swagger
   * /organizations/{organizationId}/customers/{id}:
   *   get:
   *     tags: [Customers]
   *     summary: Get customer details
   *     description: |
   *       Retrieve detailed information for a specific customer including person/business
   *       details, addresses, and customer statistics with proper multi-tenant isolation.
   *     parameters:
   *       - $ref: '#/components/parameters/OrganizationId'
   *       - name: id
   *         in: path
   *         required: true
   *         description: Customer ID
   *         schema:
   *           type: string
   *           format: uuid
   *           example: "550e8400-e29b-41d4-a716-446655440000"
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Customer details retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 customer:
   *                   allOf:
   *                     - $ref: '#/components/schemas/Customer'
   *                     - type: object
   *                       properties:
   *                         stats:
   *                           type: object
   *                           description: Customer statistics
   *                           properties:
   *                             quotes:
   *                               type: integer
   *                               description: Number of quotes
   *                             invoices:
   *                               type: integer
   *                               description: Number of invoices
   *                             payments:
   *                               type: integer
   *                               description: Number of payments
   *                             projects:
   *                               type: integer
   *                               description: Number of projects
   *             examples:
   *               PersonCustomer:
   *                 summary: Person customer details
   *                 value:
   *                   customer:
   *                     id: "550e8400-e29b-41d4-a716-446655440000"
   *                     customerNumber: "CUST-001"
   *                     type: "PERSON"
   *                     tier: "PERSONAL"
   *                     status: "ACTIVE"
   *                     person:
   *                       firstName: "John"
   *                       lastName: "Doe"
   *                       email: "john.doe@email.com"
   *                       phone: "+1-555-123-4567"
   *                     stats:
   *                       quotes: 3
   *                       invoices: 2
   *                       payments: 2
   *                       projects: 1
   *       '401':
   *         $ref: '#/components/responses/AuthenticationError'
   *       '403':
   *         $ref: '#/components/responses/AuthorizationError'
   *       '404':
   *         description: Customer not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/NotFoundError'
   *       '429':
   *         $ref: '#/components/responses/RateLimitError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
  async getCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Use organizationId from URL (preferred) or JWT (fallback for backward compatibility)
      const organizationId = req.params.organizationId || req.user.organizationId;

      const customer = await customerService.getCustomer(
        req.params.id!,
        organizationId,
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

  /**
   * @swagger
   * /organizations/{organizationId}/customers/{id}:
   *   put:
   *     tags: [Customers]
   *     summary: Update customer details
   *     description: |
   *       Update customer information including person/business details, tier, status,
   *       and billing preferences with comprehensive audit logging and multi-tenant isolation.
   *     parameters:
   *       - $ref: '#/components/parameters/OrganizationId'
   *       - name: id
   *         in: path
   *         required: true
   *         description: Customer ID
   *         schema:
   *           type: string
   *           format: uuid
   *           example: "550e8400-e29b-41d4-a716-446655440000"
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tier:
   *                 $ref: '#/components/schemas/CustomerTier'
   *               status:
   *                 $ref: '#/components/schemas/CustomerStatus'
   *               creditLimit:
   *                 type: number
   *                 format: decimal
   *                 description: Customer credit limit
   *                 example: 7500.00
   *               paymentTerms:
   *                 type: integer
   *                 description: Payment terms in days
   *                 example: 30
   *               taxExempt:
   *                 type: boolean
   *                 description: Tax exemption status
   *               preferredCurrency:
   *                 $ref: '#/components/schemas/Currency'
   *               notes:
   *                 type: string
   *                 description: Internal notes
   *                 example: "Updated credit limit due to good payment history"
   *               person:
   *                 type: object
   *                 description: Person details (for PERSON type customers)
   *                 properties:
   *                   firstName:
   *                     type: string
   *                     example: "Jane"
   *                   lastName:
   *                     type: string
   *                     example: "Smith"
   *                   email:
   *                     type: string
   *                     format: email
   *                     example: "jane.smith@email.com"
   *                   phone:
   *                     type: string
   *                     example: "+1-555-987-6543"
   *               business:
   *                 type: object
   *                 description: Business details (for BUSINESS type customers)
   *                 properties:
   *                   legalName:
   *                     type: string
   *                     example: "Smith Enterprises Inc."
   *                   tradingName:
   *                     type: string
   *                     example: "Smith Co."
   *                   email:
   *                     type: string
   *                     format: email
   *                     example: "contact@smithenterprises.com"
   *                   phone:
   *                     type: string
   *                     example: "+1-555-111-2222"
   *           examples:
   *             UpdatePersonCustomer:
   *               summary: Update person customer
   *               value:
   *                 tier: "SMALL_BUSINESS"
   *                 creditLimit: 7500.00
   *                 paymentTerms: 30
   *                 person:
   *                   email: "jane.smith@newdomain.com"
   *                   phone: "+1-555-987-6543"
   *             UpdateBusinessCustomer:
   *               summary: Update business customer
   *               value:
   *                 status: "ACTIVE"
   *                 creditLimit: 25000.00
   *                 business:
   *                   email: "billing@smithenterprises.com"
   *     responses:
   *       '200':
   *         description: Customer updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Customer updated successfully"
   *                 customer:
   *                   $ref: '#/components/schemas/Customer'
   *       '400':
   *         $ref: '#/components/responses/ValidationError'
   *       '401':
   *         $ref: '#/components/responses/AuthenticationError'
   *       '403':
   *         $ref: '#/components/responses/AuthorizationError'
   *       '404':
   *         description: Customer not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/NotFoundError'
   *       '429':
   *         $ref: '#/components/responses/RateLimitError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
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

      // Use organizationId from URL (preferred) or JWT (fallback for backward compatibility)
      const organizationId = req.params.organizationId || req.user.organizationId;

      const customer = await customerService.updateCustomer(
        req.params.id!,
        req.body,
        organizationId,
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

  /**
   * @swagger
   * /organizations/{organizationId}/customers:
   *   get:
   *     tags: [Customers]
   *     summary: List customers with filtering and pagination
   *     description: |
   *       Retrieve a paginated list of customers for the organization with support for
   *       filtering by type, tier, status, and text search. Results are sorted by creation date.
   *     parameters:
   *       - $ref: '#/components/parameters/OrganizationId'
   *       - $ref: '#/components/parameters/Page'
   *       - $ref: '#/components/parameters/Limit'
   *       - $ref: '#/components/parameters/Sort'
   *       - $ref: '#/components/parameters/Search'
   *       - name: type
   *         in: query
   *         description: Filter by customer type
   *         schema:
   *           type: string
   *           enum: [PERSON, BUSINESS]
   *       - name: tier
   *         in: query
   *         description: Filter by customer tier
   *         schema:
   *           $ref: '#/components/schemas/CustomerTier'
   *       - name: status
   *         in: query
   *         description: Filter by customer status
   *         schema:
   *           $ref: '#/components/schemas/CustomerStatus'
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Customers retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 customers:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Customer'
   *                 pagination:
   *                   $ref: '#/components/schemas/PaginationMeta'
   *                 filters:
   *                   type: object
   *                   description: Applied filters
   *                   properties:
   *                     type:
   *                       type: string
   *                     tier:
   *                       type: string
   *                     status:
   *                       type: string
   *                     search:
   *                       type: string
   *             example:
   *               customers:
   *                 - id: "cust_123"
   *                   customerNumber: "CUST-2023-001"
   *                   type: "PERSON"
   *                   tier: "PERSONAL"
   *                   status: "ACTIVE"
   *                   person:
   *                     firstName: "John"
   *                     lastName: "Doe"
   *                     email: "john.doe@email.com"
   *                   createdAt: "2023-12-01T10:30:00.000Z"
   *               pagination:
   *                 page: 1
   *                 limit: 20
   *                 total: 150
   *                 totalPages: 8
   *                 hasNext: true
   *                 hasPrev: false
   *       '400':
   *         $ref: '#/components/responses/ValidationError'
   *       '401':
   *         $ref: '#/components/responses/AuthenticationError'
   *       '403':
   *         $ref: '#/components/responses/AuthorizationError'
   *       '429':
   *         $ref: '#/components/responses/RateLimitError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
  async listCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendValidationError(res, errors.array());
        return;
      }

      if (!req.user) {
        sendUnauthorized(res);
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

      // Use organizationId from URL (preferred) or JWT (fallback for backward compatibility)
      const organizationId = req.params.organizationId || req.user.organizationId;
      const result = await customerService.listCustomers(filters, organizationId);

      // Map customer data for response
      const customers = result.customers.map(customer => ({
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
      }));

      // Calculate pagination metadata
      const pagination = calculatePagination(
        result.total,
        filters.limit || 50,
        filters.offset || 0
      );

      // Send standardized response (handles empty arrays correctly)
      sendSuccess(res, { customers }, 200, pagination);
    } catch (error: any) {
      sendInternalError(res, error.message);
    }
  }

  /**
   * @swagger
   * /organizations/{organizationId}/customers/{id}:
   *   delete:
   *     tags: [Customers]
   *     summary: Delete customer (soft delete)
   *     description: |
   *       Perform a soft delete on a customer record, setting deletedAt timestamp while
   *       preserving all associated data for audit and historical purposes with multi-tenant isolation.
   *     parameters:
   *       - $ref: '#/components/parameters/OrganizationId'
   *       - name: id
   *         in: path
   *         required: true
   *         description: Customer ID
   *         schema:
   *           type: string
   *           format: uuid
   *           example: "550e8400-e29b-41d4-a716-446655440000"
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Customer deleted successfully (soft delete)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Customer deleted successfully"
   *                 customer:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                       format: uuid
   *                       description: Customer ID
   *                       example: "550e8400-e29b-41d4-a716-446655440000"
   *                     status:
   *                       type: string
   *                       enum: [INACTIVE]
   *                       description: Customer status after deletion
   *                       example: "INACTIVE"
   *                     deletedAt:
   *                       type: string
   *                       format: date-time
   *                       description: Soft deletion timestamp
   *                       example: "2024-01-15T10:30:00.000Z"
   *             example:
   *               message: "Customer deleted successfully"
   *               customer:
   *                 id: "550e8400-e29b-41d4-a716-446655440000"
   *                 status: "INACTIVE"
   *                 deletedAt: "2024-01-15T10:30:00.000Z"
   *       '401':
   *         $ref: '#/components/responses/AuthenticationError'
   *       '403':
   *         $ref: '#/components/responses/AuthorizationError'
   *       '404':
   *         description: Customer not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/NotFoundError'
   *       '409':
   *         description: Customer cannot be deleted (has active dependencies)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: "Cannot delete customer with active invoices or projects"
   *                 code:
   *                   type: string
   *                   example: "CUSTOMER_HAS_DEPENDENCIES"
   *                 dependencies:
   *                   type: object
   *                   properties:
   *                     activeInvoices:
   *                       type: integer
   *                       example: 2
   *                     activeProjects:
   *                       type: integer
   *                       example: 1
   *       '429':
   *         $ref: '#/components/responses/RateLimitError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
  async deleteCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Use organizationId from URL (preferred) or JWT (fallback for backward compatibility)
      const organizationId = req.params.organizationId || req.user.organizationId;

      const customer = await customerService.deleteCustomer(
        req.params.id!,
        organizationId,
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

      // Use organizationId from URL (preferred) or JWT (fallback for backward compatibility)
      const organizationId = req.params.organizationId || req.user.organizationId;

      const stats = await customerService.getCustomerStats(
        req.params.id!,
        organizationId
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