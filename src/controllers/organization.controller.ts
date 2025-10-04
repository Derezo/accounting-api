import { Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { organizationService } from '../services/organization.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { UserRole, OrganizationType } from '../types/enums';

export const validateCreateOrganization = [
  body('name').notEmpty().trim().withMessage('Organization name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').notEmpty().trim().withMessage('Phone number is required'),
  body('legalName').optional().trim(),
  body('domain').optional().trim(),
  body('type').optional().isIn(Object.values(OrganizationType)),
  body('website').optional().isURL(),
  body('businessNumber').optional().trim(),
  body('taxNumber').optional().trim()
];

export const validateUpdateOrganization = [
  body('name').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().notEmpty().trim(),
  body('legalName').optional().trim(),
  body('domain').optional().trim(),
  body('type').optional().isIn(Object.values(OrganizationType)),
  body('website').optional().isURL(),
  body('businessNumber').optional().trim(),
  body('taxNumber').optional().trim(),
  body('isActive').optional().isBoolean()
];

export const validateListOrganizations = [
  query('type').optional().isIn(Object.values(OrganizationType)),
  query('isActive').optional().isBoolean(),
  query('search').optional().trim(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
];

export const validateSettings = [
  body('defaultCurrency').optional().isLength({ min: 3, max: 3 }),
  body('defaultTaxRate').optional().isFloat({ min: 0, max: 1 }),
  body('depositPercentage').optional().isFloat({ min: 0, max: 1 }),
  body('paymentTermsDays').optional().isInt({ min: 1, max: 365 }),
  body('quoteValidityDays').optional().isInt({ min: 1, max: 365 }),
  body('timezone').optional().trim(),
  body('dateFormat').optional().trim(),
  body('numberFormat').optional().trim()
];

export class OrganizationController {
  async createOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // Only super admins can create organizations
      if (req.user?.role !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Only super admins can create organizations' });
        return;
      }

      // Validate domain uniqueness if provided
      if (req.body.domain) {
        const isDomainAvailable = await organizationService.validateDomain(req.body.domain);
        if (!isDomainAvailable) {
          res.status(400).json({ error: 'Domain is already in use' });
          return;
        }
      }

      const organization = await organizationService.createOrganization(
        req.body,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Organization created successfully',
        organization: {
          id: organization.id,
          name: organization.name,
          domain: organization.domain,
          type: organization.type,
          email: organization.email,
          isActive: organization.isActive,
          createdAt: organization.createdAt
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const organization = await organizationService.getOrganization(
        req.params.id,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      if (!organization) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      res.json({
        organization: {
          id: organization.id,
          name: organization.name,
          legalName: organization.legalName,
          domain: organization.domain,
          type: organization.type,
          email: organization.email,
          phone: organization.phone,
          website: organization.website,
          businessNumber: organization.businessNumber,
          taxNumber: organization.taxNumber,
          isActive: organization.isActive,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
          stats: (organization as any)._count
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Validate domain uniqueness if being updated
      if (req.body.domain) {
        const isDomainAvailable = await organizationService.validateDomain(
          req.body.domain,
          req.params.id
        );
        if (!isDomainAvailable) {
          res.status(400).json({ error: 'Domain is already in use' });
          return;
        }
      }

      const organization = await organizationService.updateOrganization(
        req.params.id,
        req.body,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Organization updated successfully',
        organization: {
          id: organization.id,
          name: organization.name,
          legalName: organization.legalName,
          domain: organization.domain,
          type: organization.type,
          email: organization.email,
          phone: organization.phone,
          website: organization.website,
          businessNumber: organization.businessNumber,
          taxNumber: organization.taxNumber,
          isActive: organization.isActive,
          updatedAt: organization.updatedAt
        }
      });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  async listOrganizations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user || req.user.role !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Only super admins can list all organizations' });
        return;
      }

      const filters = {
        type: req.query.type as OrganizationType,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await organizationService.listOrganizations(filters, true);

      res.json({
        organizations: result.organizations.map(org => ({
          id: org.id,
          name: org.name,
          domain: org.domain,
          type: org.type,
          email: org.email,
          isActive: org.isActive,
          createdAt: org.createdAt,
          stats: (org as any)._count
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

  async deactivateOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Only super admins can deactivate organizations' });
        return;
      }

      const organization = await organizationService.deactivateOrganization(
        req.params.id,
        'super-admin',
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Organization deactivated successfully',
        organization: {
          id: organization.id,
          name: organization.name,
          isActive: organization.isActive,
          updatedAt: organization.updatedAt
        }
      });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  async getOrganizationStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const stats = await organizationService.getOrganizationStats(
        req.params.id,
        req.user.organizationId
      );

      res.json({ stats });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  async getSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const settings = await organizationService.getOrganizationSettings(
        req.params.id,
        req.user.organizationId
      );

      res.json({ settings });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  async updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const settings = await organizationService.updateOrganizationSettings(
        req.params.id,
        req.body,
        req.user.organizationId,
        {
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Settings updated successfully',
        settings
      });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }
}

export const organizationController = new OrganizationController();