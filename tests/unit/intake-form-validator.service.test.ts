/**
 * Unit tests for IntakeFormValidatorService
 */

import { IntakeFormValidatorService } from '../../src/services/intake-form-validator.service';
import { FieldType, FieldDto } from '../../src/types/intake-form-template.types';

describe('IntakeFormValidatorService', () => {
  let service: IntakeFormValidatorService;

  beforeEach(() => {
    service = new IntakeFormValidatorService();
  });

  describe('validateFormData', () => {
    it('should validate all required fields', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'email',
          label: 'Email',
          fieldType: FieldType.EMAIL,
          dataType: 'string',
          isRequired: true,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'field-2',
          templateId: 'template-123',
          fieldKey: 'phone',
          label: 'Phone',
          fieldType: FieldType.PHONE,
          dataType: 'string',
          isRequired: true,
          sortOrder: 2,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        email: 'test@example.com',
        phone: '555-123-4567',
      };

      const result = service.validateFormData(fields, formData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required fields', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'email',
          label: 'Email',
          fieldType: FieldType.EMAIL,
          dataType: 'string',
          isRequired: true,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {};

      const result = service.validateFormData(fields, formData);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('email');
    });

    it('should validate email format', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'email',
          label: 'Email',
          fieldType: FieldType.EMAIL,
          dataType: 'string',
          isRequired: false,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        email: 'invalid-email',
      };

      const result = service.validateFormData(fields, formData);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('email');
    });

    it('should validate phone format', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'phone',
          label: 'Phone',
          fieldType: FieldType.PHONE,
          dataType: 'string',
          isRequired: false,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        phone: '555-1234-5678',
      };

      const result = service.validateFormData(fields, formData);

      expect(result.valid).toBe(true);
    });

    it('should validate number fields', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'age',
          label: 'Age',
          fieldType: FieldType.NUMBER,
          dataType: 'number',
          isRequired: false,
          validationRules: { min: 18, max: 100 },
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        age: 25,
      };

      const result = service.validateFormData(fields, formData);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid number ranges', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'age',
          label: 'Age',
          fieldType: FieldType.NUMBER,
          dataType: 'number',
          isRequired: false,
          validationRules: { min: 18, max: 100 },
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        age: 150,
      };

      const result = service.validateFormData(fields, formData);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at most 100');
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate equals condition', () => {
      const condition = {
        operator: 'AND' as const,
        conditions: [
          {
            field: 'customer_type',
            operator: 'equals' as const,
            value: 'COMMERCIAL',
          },
        ],
      };

      const formData = {
        customer_type: 'COMMERCIAL',
      };

      const result = service.evaluateCondition(condition, formData);

      expect(result).toBe(true);
    });

    it('should evaluate notEquals condition', () => {
      const condition = {
        operator: 'AND' as const,
        conditions: [
          {
            field: 'customer_type',
            operator: 'notEquals' as const,
            value: 'RESIDENTIAL',
          },
        ],
      };

      const formData = {
        customer_type: 'COMMERCIAL',
      };

      const result = service.evaluateCondition(condition, formData);

      expect(result).toBe(true);
    });

    it('should evaluate contains condition', () => {
      const condition = {
        operator: 'AND' as const,
        conditions: [
          {
            field: 'services',
            operator: 'contains' as const,
            value: 'HVAC',
          },
        ],
      };

      const formData = {
        services: ['HVAC', 'PLUMBING'],
      };

      const result = service.evaluateCondition(condition, formData);

      expect(result).toBe(true);
    });

    it('should evaluate AND conditions', () => {
      const condition = {
        operator: 'AND' as const,
        conditions: [
          {
            field: 'age',
            operator: 'greaterThan' as const,
            value: 18,
          },
          {
            field: 'country',
            operator: 'equals' as const,
            value: 'Canada',
          },
        ],
      };

      const formData = {
        age: 25,
        country: 'Canada',
      };

      const result = service.evaluateCondition(condition, formData);

      expect(result).toBe(true);
    });

    it('should evaluate OR conditions', () => {
      const condition = {
        operator: 'OR' as const,
        conditions: [
          {
            field: 'payment_method',
            operator: 'equals' as const,
            value: 'CREDIT_CARD',
          },
          {
            field: 'payment_method',
            operator: 'equals' as const,
            value: 'DEBIT_CARD',
          },
        ],
      };

      const formData = {
        payment_method: 'DEBIT_CARD',
      };

      const result = service.evaluateCondition(condition, formData);

      expect(result).toBe(true);
    });

    it('should evaluate isEmpty condition', () => {
      const condition = {
        operator: 'AND' as const,
        conditions: [
          {
            field: 'optional_field',
            operator: 'isEmpty' as const,
          },
        ],
      };

      const formData = {
        optional_field: '',
      };

      const result = service.evaluateCondition(condition, formData);

      expect(result).toBe(true);
    });
  });

  describe('sanitizeFormData', () => {
    it('should sanitize string fields', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'name',
          label: 'Name',
          fieldType: FieldType.TEXT,
          dataType: 'string',
          isRequired: false,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        name: '  John Doe  ',
      };

      const result = service.sanitizeFormData(fields, formData);

      expect(result.name).toBe('John Doe');
    });

    it('should sanitize phone fields', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'phone',
          label: 'Phone',
          fieldType: FieldType.PHONE,
          dataType: 'string',
          isRequired: false,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        phone: '(555) 123-4567',
      };

      const result = service.sanitizeFormData(fields, formData);

      expect(result.phone).toBe('(555) 123-4567');
    });

    it('should convert number fields', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'quantity',
          label: 'Quantity',
          fieldType: FieldType.NUMBER,
          dataType: 'number',
          isRequired: false,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        quantity: '42',
      };

      const result = service.sanitizeFormData(fields, formData);

      expect(result.quantity).toBe(42);
      expect(typeof result.quantity).toBe('number');
    });

    it('should convert boolean fields', () => {
      const fields: FieldDto[] = [
        {
          id: 'field-1',
          templateId: 'template-123',
          fieldKey: 'accept_terms',
          label: 'Accept Terms',
          fieldType: FieldType.CHECKBOX,
          dataType: 'boolean',
          isRequired: false,
          sortOrder: 1,
          width: 'FULL',
          encrypted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const formData = {
        accept_terms: 'true',
      };

      const result = service.sanitizeFormData(fields, formData);

      expect(result.accept_terms).toBe(true);
      expect(typeof result.accept_terms).toBe('boolean');
    });
  });
});
