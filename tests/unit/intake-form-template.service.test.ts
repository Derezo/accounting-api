/**
 * Unit tests for IntakeFormTemplateService
 */

import { PrismaClient } from '@prisma/client';
import { IntakeFormTemplateService } from '../../src/services/intake-form-template.service';
import { TemplateType, Industry, FieldType, StepLayout } from '../../src/types/intake-form-template.types';
import { ValidationError, NotFoundError } from '../../src/utils/errors';

// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

describe('IntakeFormTemplateService', () => {
  let service: IntakeFormTemplateService;
  let mockPrisma: any;
  const organizationId = 'org-123';

  beforeEach(() => {
    mockPrisma = {
      intakeFormTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      intakeFormStep: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      intakeFormField: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      intakeFormTransition: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    service = new IntakeFormTemplateService(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      const templateData = {
        name: 'HVAC Service Request',
        description: 'Template for HVAC service requests',
        templateType: TemplateType.INDUSTRY,
        industry: Industry.HVAC,
      };

      const mockTemplate = {
        id: 'template-123',
        organizationId,
        ...templateData,
        version: '1.0.0',
        isActive: true,
        isDefault: false,
        isPublic: false,
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
        autoConvert: false,
        conversionSettings: null,
        submissionCount: 0,
        conversionCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        steps: [],
        fields: [],
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.intakeFormTemplate.create.mockResolvedValue(mockTemplate);

      const result = await service.createTemplate(organizationId, templateData);

      expect(result).toBeDefined();
      expect(result.name).toBe(templateData.name);
      expect(result.industry).toBe(Industry.HVAC);
      expect(mockPrisma.intakeFormTemplate.create).toHaveBeenCalled();
    });

    it('should throw error if template with same name exists', async () => {
      const templateData = {
        name: 'Duplicate Template',
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createTemplate(organizationId, templateData)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getTemplateById', () => {
    it('should return template with steps and fields', async () => {
      const mockTemplate = {
        id: 'template-123',
        organizationId,
        name: 'Test Template',
        config: JSON.stringify({ theme: { primaryColor: '#007bff' } }),
        completionRules: JSON.stringify({ minimumPercentage: 80 }),
        steps: [
          {
            id: 'step-1',
            stepKey: 'email_capture',
            name: 'Email Capture',
            sortOrder: 0,
            fields: [],
            transitions: [],
            skipCondition: null,
            completionRules: null,
            displayStyle: null,
          },
        ],
        fields: [],
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(mockTemplate);

      const result = await service.getTemplateById(organizationId, 'template-123');

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Template');
      expect(result.steps).toHaveLength(1);
      expect(result.config).toEqual({ theme: { primaryColor: '#007bff' } });
    });

    it('should throw NotFoundError if template does not exist', async () => {
      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getTemplateById(organizationId, 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listTemplates', () => {
    it('should return all templates for organization', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          organizationId,
          name: 'Template 1',
          config: JSON.stringify({}),
          completionRules: JSON.stringify({}),
          steps: [],
          fields: [],
        },
        {
          id: 'template-2',
          organizationId,
          name: 'Template 2',
          config: JSON.stringify({}),
          completionRules: JSON.stringify({}),
          steps: [],
          fields: [],
        },
      ];

      mockPrisma.intakeFormTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await service.listTemplates(organizationId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Template 1');
      expect(result[1].name).toBe('Template 2');
    });
  });

  describe('createStep', () => {
    it('should add a step to template', async () => {
      const stepData = {
        stepKey: 'service_details',
        name: 'Service Details',
        sortOrder: 1,
        layout: StepLayout.TWO_COLUMN,
      };

      const mockTemplate = {
        id: 'template-123',
        organizationId,
        steps: [],
        fields: [],
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
      };

      const mockStep = {
        id: 'step-123',
        templateId: 'template-123',
        ...stepData,
        isRequired: true,
        canSkip: false,
        skipCondition: null,
        completionRules: null,
        displayStyle: null,
        helpText: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        fields: [],
        transitions: [],
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.intakeFormStep.findFirst.mockResolvedValue(null);
      mockPrisma.intakeFormStep.create.mockResolvedValue(mockStep);

      const result = await service.createStep(organizationId, 'template-123', stepData);

      expect(result).toBeDefined();
      expect(result.stepKey).toBe('service_details');
      expect(result.layout).toBe(StepLayout.TWO_COLUMN);
    });

    it('should throw error if step key already exists', async () => {
      const stepData = {
        stepKey: 'duplicate_step',
        name: 'Duplicate Step',
        sortOrder: 1,
      };

      const mockTemplate = {
        id: 'template-123',
        organizationId,
        steps: [],
        fields: [],
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.intakeFormStep.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createStep(organizationId, 'template-123', stepData)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('createField', () => {
    it('should add a field to template', async () => {
      const fieldData = {
        fieldKey: 'customer_email',
        label: 'Email Address',
        fieldType: FieldType.EMAIL,
        isRequired: true,
        sortOrder: 1,
      };

      const mockTemplate = {
        id: 'template-123',
        organizationId,
        steps: [],
        fields: [],
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
      };

      const mockField = {
        id: 'field-123',
        templateId: 'template-123',
        stepId: null,
        ...fieldData,
        dataType: 'string',
        placeholder: null,
        helpText: null,
        validationRules: null,
        validationError: null,
        options: null,
        defaultValue: null,
        showIf: null,
        requireIf: null,
        width: 'FULL',
        displayStyle: null,
        autocomplete: null,
        mappingPath: null,
        encrypted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.intakeFormField.findFirst.mockResolvedValue(null);
      mockPrisma.intakeFormField.create.mockResolvedValue(mockField);

      const result = await service.createField(organizationId, 'template-123', fieldData);

      expect(result).toBeDefined();
      expect(result.fieldKey).toBe('customer_email');
      expect(result.fieldType).toBe(FieldType.EMAIL);
      expect(result.isRequired).toBe(true);
    });

    it('should throw error if field key already exists', async () => {
      const fieldData = {
        fieldKey: 'duplicate_field',
        label: 'Duplicate Field',
        fieldType: FieldType.TEXT,
        sortOrder: 1,
      };

      const mockTemplate = {
        id: 'template-123',
        organizationId,
        steps: [],
        fields: [],
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.intakeFormField.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createField(organizationId, 'template-123', fieldData)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateTemplate', () => {
    it('should update template properties', async () => {
      const updateData = {
        name: 'Updated Template Name',
        isActive: false,
      };

      const mockTemplate = {
        id: 'template-123',
        organizationId,
        name: 'Original Name',
        isActive: true,
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
        steps: [],
        fields: [],
      };

      const mockUpdated = {
        ...mockTemplate,
        ...updateData,
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.intakeFormTemplate.update.mockResolvedValue(mockUpdated);

      const result = await service.updateTemplate(organizationId, 'template-123', updateData);

      expect(result.name).toBe('Updated Template Name');
      expect(result.isActive).toBe(false);
    });
  });

  describe('deleteTemplate', () => {
    it('should soft delete template', async () => {
      const mockTemplate = {
        id: 'template-123',
        organizationId,
        config: JSON.stringify({}),
        completionRules: JSON.stringify({}),
        steps: [],
        fields: [],
      };

      mockPrisma.intakeFormTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.intakeFormTemplate.update.mockResolvedValue({ ...mockTemplate, deletedAt: new Date() });

      await service.deleteTemplate(organizationId, 'template-123');

      expect(mockPrisma.intakeFormTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
