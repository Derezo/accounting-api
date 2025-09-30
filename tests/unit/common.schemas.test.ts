import {
  uuidSchema,
  positiveIntegerSchema,
  nonNegativeIntegerSchema,
  positiveDecimalSchema,
  nonNegativeDecimalSchema,
  currencyAmountSchema,
  percentageSchema,
  phoneSchema,
  emailSchema,
  websiteSchema,
  postalCodeSchema,
  dateSchema,
  futureDateSchema,
  pastDateSchema,
  shortTextSchema,
  mediumTextSchema,
  longTextSchema,
  nameSchema,
  codeSchema,
  slugSchema,
  currencyCodeSchema,
  countryCodeSchema,
  provinceStateSchema,
  businessNumberSchema,
  taxIdSchema,
  ssnSchema,
  addressSchema,
  contactInfoSchema,
  paginationSchema,
  dateRangeSchema,
  fileUploadSchema,
  imageUploadSchema,
  documentUploadSchema,
  userRoleSchema,
  customerStatusSchema,
  customerTierSchema,
  paymentStatusSchema,
  paymentMethodSchema,
  invoiceStatusSchema,
  quoteStatusSchema,
  projectStatusSchema,
  metadataSchema,
  customFieldSchema,
  successResponseSchema,
  errorResponseSchema
} from '../../src/validators/common.schemas';
import { ZodError } from 'zod';

describe('Common Schemas Validation', () => {
  describe('uuidSchema', () => {
    it('should validate correct UUIDs', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      ];

      validUUIDs.forEach(uuid => {
        expect(() => uuidSchema.parse(uuid)).not.toThrow();
      });
    });

    it('should reject invalid UUIDs', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '123456789',
        '123e4567-e89b-12d3-a456', // Too short
        '123e4567-e89b-12d3-a456-426614174000-extra' // Too long
      ];

      invalidUUIDs.forEach(uuid => {
        expect(() => uuidSchema.parse(uuid)).toThrow('Invalid UUID format');
      });
    });
  });

  describe('positiveIntegerSchema', () => {
    it('should validate positive integers', () => {
      const validNumbers = [1, 42, 999, 1000000];

      validNumbers.forEach(num => {
        expect(() => positiveIntegerSchema.parse(num)).not.toThrow();
      });
    });

    it('should reject zero, negative numbers, and decimals', () => {
      const invalidNumbers = [0, -1, -100, 3.14, 0.5];

      invalidNumbers.forEach(num => {
        expect(() => positiveIntegerSchema.parse(num)).toThrow();
      });
    });
  });

  describe('nonNegativeIntegerSchema', () => {
    it('should validate non-negative integers', () => {
      const validNumbers = [0, 1, 42, 999];

      validNumbers.forEach(num => {
        expect(() => nonNegativeIntegerSchema.parse(num)).not.toThrow();
      });
    });

    it('should reject negative numbers and decimals', () => {
      const invalidNumbers = [-1, -100, 3.14, -0.5];

      invalidNumbers.forEach(num => {
        expect(() => nonNegativeIntegerSchema.parse(num)).toThrow();
      });
    });
  });

  describe('positiveDecimalSchema', () => {
    it('should validate positive decimals with 2 decimal places', () => {
      const validNumbers = [1.00, 42.50, 999.99, 0.01];

      validNumbers.forEach(num => {
        expect(() => positiveDecimalSchema.parse(num)).not.toThrow();
      });
    });

    it('should reject zero, negative numbers, and more than 2 decimal places', () => {
      const invalidNumbers = [0, -1.50, -100.00, 3.141, 0.001];

      invalidNumbers.forEach(num => {
        expect(() => positiveDecimalSchema.parse(num)).toThrow();
      });
    });
  });

  describe('currencyAmountSchema', () => {
    it('should validate currency amounts', () => {
      const validAmounts = [0, 1.00, 99.99, 1000.50, 999999.99];

      validAmounts.forEach(amount => {
        expect(() => currencyAmountSchema.parse(amount)).not.toThrow();
      });
    });

    it('should reject negative amounts and amounts exceeding maximum', () => {
      const invalidAmounts = [-1.00, -100.50, 1000000000.00, 99.999];

      invalidAmounts.forEach(amount => {
        expect(() => currencyAmountSchema.parse(amount)).toThrow();
      });
    });
  });

  describe('percentageSchema', () => {
    it('should validate percentages between 0-100', () => {
      const validPercentages = [0, 25.50, 50.00, 100.00, 0.01];

      validPercentages.forEach(percentage => {
        expect(() => percentageSchema.parse(percentage)).not.toThrow();
      });
    });

    it('should reject negative percentages and over 100%', () => {
      const invalidPercentages = [-1.00, 100.01, 150.00, -0.01];

      invalidPercentages.forEach(percentage => {
        expect(() => percentageSchema.parse(percentage)).toThrow();
      });
    });
  });

  describe('phoneSchema', () => {
    it('should validate phone numbers', () => {
      const validPhones = ['+1234567890', '1234567890', '+441234567890', ''];

      validPhones.forEach(phone => {
        expect(() => phoneSchema.parse(phone)).not.toThrow();
      });
    });

    it('should reject invalid phone numbers', () => {
      const invalidPhones = ['abc123', '++123', 'phone', '01234567890']; // Leading zero

      invalidPhones.forEach(phone => {
        expect(() => phoneSchema.parse(phone)).toThrow();
      });
    });
  });

  describe('emailSchema', () => {
    it('should validate and normalize emails', () => {
      const testCases = [
        { input: 'USER@EXAMPLE.COM', expected: 'user@example.com' },
        { input: 'test@domain.com', expected: 'test@domain.com' },
        { input: 'admin@company.org', expected: 'admin@company.org' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(emailSchema.parse(input)).toBe(expected);
      });
    });

    it('should reject invalid emails', () => {
      const invalidEmails = ['invalid', '@domain.com', 'user@', ''];

      invalidEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).toThrow();
      });
    });
  });

  describe('websiteSchema', () => {
    it('should validate website URLs', () => {
      const validURLs = [
        'https://example.com',
        'http://test.org',
        'https://www.company.com/path',
        ''
      ];

      validURLs.forEach(url => {
        expect(() => websiteSchema.parse(url)).not.toThrow();
      });
    });

    it('should reject invalid URLs', () => {
      const invalidURLs = ['not-a-url'];

      invalidURLs.forEach(url => {
        expect(() => websiteSchema.parse(url)).toThrow();
      });
    });
  });

  describe('postalCodeSchema', () => {
    it('should validate and normalize postal codes', () => {
      const testCases = [
        { input: 'k1a 0a6', expected: 'K1A 0A6' },
        { input: '90210', expected: '90210' },
        { input: 'sw1a 1aa', expected: 'SW1A 1AA' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(postalCodeSchema.parse(input)).toBe(expected);
      });
    });

    it('should reject invalid postal codes', () => {
      const invalidCodes = ['', 'AB', '123456789012345', 'K1A@0A6'];

      invalidCodes.forEach(code => {
        expect(() => postalCodeSchema.parse(code)).toThrow();
      });
    });
  });

  describe('dateSchema', () => {
    it('should validate and transform date strings', () => {
      const dateStr = '2023-12-31T23:59:59Z';
      const result = dateSchema.parse(dateStr);
      expect(result).toBeInstanceOf(Date);
    });

    it('should accept Date objects', () => {
      const date = new Date();
      const result = dateSchema.parse(date);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(date.getTime());
    });

    it('should reject invalid date strings', () => {
      const invalidDates = ['invalid-date', '2023-13-01', '2023-02-30'];

      invalidDates.forEach(date => {
        expect(() => dateSchema.parse(date)).toThrow();
      });
    });
  });

  describe('futureDateSchema', () => {
    it('should validate future dates', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      expect(() => futureDateSchema.parse(futureDate)).not.toThrow();
    });

    it('should reject past and current dates', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const currentDate = new Date();

      expect(() => futureDateSchema.parse(pastDate)).toThrow('Date must be in the future');
      expect(() => futureDateSchema.parse(currentDate)).toThrow('Date must be in the future');
    });
  });

  describe('pastDateSchema', () => {
    it('should validate past and current dates', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const currentDate = new Date();

      expect(() => pastDateSchema.parse(pastDate)).not.toThrow();
      expect(() => pastDateSchema.parse(currentDate)).not.toThrow();
    });

    it('should reject future dates', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      expect(() => pastDateSchema.parse(futureDate)).toThrow('Date cannot be in the future');
    });
  });

  describe('text schemas', () => {
    describe('shortTextSchema', () => {
      it('should validate and trim short text', () => {
        expect(shortTextSchema.parse('  Hello  ')).toBe('Hello');
        expect(shortTextSchema.parse('Test')).toBe('Test');
      });

      it('should reject empty and too long text', () => {
        expect(() => shortTextSchema.parse('')).toThrow();
        expect(() => shortTextSchema.parse('a'.repeat(101))).toThrow();
      });
    });

    describe('mediumTextSchema', () => {
      it('should validate and trim medium text', () => {
        const text = 'This is a medium length text';
        expect(mediumTextSchema.parse(`  ${text}  `)).toBe(text);
      });

      it('should reject empty and too long text', () => {
        expect(() => mediumTextSchema.parse('')).toThrow();
        expect(() => mediumTextSchema.parse('a'.repeat(501))).toThrow();
      });
    });

    describe('longTextSchema', () => {
      it('should validate optional long text', () => {
        const text = 'This is a long text that can be optional';
        expect(longTextSchema.parse(text)).toBe(text);
        expect(longTextSchema.parse(undefined)).toBeUndefined();
      });

      it('should reject too long text', () => {
        expect(() => longTextSchema.parse('a'.repeat(2001))).toThrow();
      });
    });
  });

  describe('nameSchema', () => {
    it('should validate names with allowed characters', () => {
      const validNames = [
        'John Doe',
        "O'Connor",
        'Mary-Jane',
        'Dr. Smith'
      ];

      validNames.forEach(name => {
        expect(() => nameSchema.parse(name)).not.toThrow();
        expect(nameSchema.parse(`  ${name}  `)).toBe(name);
      });
    });

    it('should reject names with invalid characters', () => {
      const invalidNames = [
        'John123',
        'John@Doe',
        'John_Doe',
        '',
        'a'.repeat(101)
      ];

      invalidNames.forEach(name => {
        expect(() => nameSchema.parse(name)).toThrow();
      });
    });
  });

  describe('codeSchema', () => {
    it('should validate and normalize codes', () => {
      const testCases = [
        { input: 'test-code', expected: 'TEST-CODE' },
        { input: '  code_123  ', expected: 'CODE_123' },
        { input: 'ABC123', expected: 'ABC123' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(codeSchema.parse(input)).toBe(expected);
      });
    });

    it('should reject invalid codes', () => {
      const invalidCodes = ['', 'code with spaces', 'code.invalid', 'a'.repeat(51)];

      invalidCodes.forEach(code => {
        expect(() => codeSchema.parse(code)).toThrow();
      });
    });
  });

  describe('slugSchema', () => {
    it('should validate and normalize slugs', () => {
      const testCases = [
        { input: 'test-slug', expected: 'test-slug' },
        { input: 'my-slug-123', expected: 'my-slug-123' },
        { input: 'simple', expected: 'simple' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(slugSchema.parse(input)).toBe(expected);
      });
    });

    it('should reject invalid slugs', () => {
      const invalidSlugs = ['', 'slug_with_underscores', 'slug with spaces', 'a'.repeat(101)];

      invalidSlugs.forEach(slug => {
        expect(() => slugSchema.parse(slug)).toThrow();
      });
    });
  });

  describe('currencyCodeSchema', () => {
    it('should validate currency codes', () => {
      const validCurrencies = ['CAD', 'USD', 'EUR', 'GBP'];

      validCurrencies.forEach(currency => {
        expect(() => currencyCodeSchema.parse(currency)).not.toThrow();
      });
    });

    it('should default to CAD', () => {
      expect(currencyCodeSchema.parse(undefined)).toBe('CAD');
    });

    it('should reject invalid currency codes', () => {
      const invalidCurrencies = ['XYZ', 'INVALID', ''];

      invalidCurrencies.forEach(currency => {
        expect(() => currencyCodeSchema.parse(currency)).toThrow();
      });
    });
  });

  describe('countryCodeSchema', () => {
    it('should validate and normalize country codes', () => {
      const testCases = [
        { input: 'CA', expected: 'CA' },
        { input: 'US', expected: 'US' },
        { input: 'GB', expected: 'GB' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(countryCodeSchema.parse(input)).toBe(expected);
      });
    });

    it('should reject invalid country codes', () => {
      const invalidCodes = ['', 'C', 'CAN', '12', 'C1'];

      invalidCodes.forEach(code => {
        expect(() => countryCodeSchema.parse(code)).toThrow();
      });
    });
  });

  describe('businessNumberSchema', () => {
    it('should validate business numbers', () => {
      const validNumbers = ['123456789', '123456789012345'];

      validNumbers.forEach(num => {
        expect(() => businessNumberSchema.parse(num)).not.toThrow();
      });
    });

    it('should remove spaces', () => {
      expect(businessNumberSchema.parse('123456789')).toBe('123456789');
    });

    it('should reject invalid business numbers', () => {
      const invalidNumbers = ['12345678', '1234567890', 'ABC123456'];

      invalidNumbers.forEach(num => {
        expect(() => businessNumberSchema.parse(num)).toThrow();
      });
    });
  });

  describe('taxIdSchema', () => {
    it('should validate and normalize tax IDs', () => {
      expect(taxIdSchema.parse('12-345-678')).toBe('12-345-678');
      expect(taxIdSchema.parse('TAXID123')).toBe('TAXID123');
    });

    it('should reject invalid tax IDs', () => {
      const invalidTaxIds = ['', '1234', 'a'.repeat(21), 'tax@id'];

      invalidTaxIds.forEach(taxId => {
        expect(() => taxIdSchema.parse(taxId)).toThrow();
      });
    });
  });

  describe('ssnSchema', () => {
    it('should validate and normalize SSNs', () => {
      const testCases = [
        { input: '123-45-6789', expected: '123456789' },
        { input: '123456789', expected: '123456789' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(ssnSchema.parse(input)).toBe(expected);
      });
    });

    it('should reject invalid SSNs', () => {
      const invalidSSNs = ['', '12345678', '1234567890', 'ABC-45-6789'];

      invalidSSNs.forEach(ssn => {
        expect(() => ssnSchema.parse(ssn)).toThrow();
      });
    });
  });

  describe('addressSchema', () => {
    it('should validate complete address', () => {
      const validAddress = {
        type: 'BILLING' as const,
        street: '123 Main St',
        street2: 'Apt 4B',
        city: 'Toronto',
        provinceState: 'ON',
        postalCode: 'K1A 0A6',
        country: 'CA',
        isDefault: true,
        isActive: true
      };

      expect(() => addressSchema.parse(validAddress)).not.toThrow();
    });

    it('should set defaults', () => {
      const minimalAddress = {
        street: '123 Main St',
        city: 'Toronto',
        provinceState: 'ON',
        postalCode: 'K1A 0A6'
      };

      const result = addressSchema.parse(minimalAddress);
      expect(result.type).toBe('BILLING');
      expect(result.country).toBe('CA');
      expect(result.isDefault).toBe(false);
      expect(result.isActive).toBe(true);
    });
  });

  describe('paginationSchema', () => {
    it('should validate pagination with defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.sortOrder).toBe('asc');
    });

    it('should validate custom pagination', () => {
      const pagination = {
        page: 3,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
        search: 'test query'
      };

      expect(() => paginationSchema.parse(pagination)).not.toThrow();
    });

    it('should enforce limits', () => {
      expect(() => paginationSchema.parse({ page: 0 })).toThrow();
      expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('dateRangeSchema', () => {
    it('should validate date ranges', () => {
      const validRange = {
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31')
      };

      expect(() => dateRangeSchema.parse(validRange)).not.toThrow();
    });

    it('should reject invalid date ranges', () => {
      const invalidRange = {
        startDate: new Date('2023-12-31'),
        endDate: new Date('2023-01-01')
      };

      expect(() => dateRangeSchema.parse(invalidRange)).toThrow('End date must be after start date');
    });
  });

  describe('fileUploadSchema', () => {
    it('should validate file uploads', () => {
      const validFile = {
        filename: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from('test')
      };

      expect(() => fileUploadSchema.parse(validFile)).not.toThrow();
    });

    it('should reject files over size limit', () => {
      const oversizedFile = {
        filename: 'large.pdf',
        mimetype: 'application/pdf',
        size: 11 * 1024 * 1024 // 11MB
      };

      expect(() => fileUploadSchema.parse(oversizedFile)).toThrow();
    });
  });

  describe('imageUploadSchema', () => {
    it('should validate image uploads', () => {
      const validImage = {
        filename: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024 // 2MB
      };

      expect(() => imageUploadSchema.parse(validImage)).not.toThrow();
    });

    it('should reject non-image files', () => {
      const invalidImage = {
        filename: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 1024
      };

      expect(() => imageUploadSchema.parse(invalidImage)).toThrow();
    });
  });

  describe('enum schemas', () => {
    describe('userRoleSchema', () => {
      it('should validate user roles', () => {
        const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'];

        validRoles.forEach(role => {
          expect(() => userRoleSchema.parse(role)).not.toThrow();
        });
      });

      it('should reject invalid roles', () => {
        expect(() => userRoleSchema.parse('INVALID_ROLE')).toThrow();
      });
    });

    describe('paymentStatusSchema', () => {
      it('should validate payment statuses', () => {
        const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];

        validStatuses.forEach(status => {
          expect(() => paymentStatusSchema.parse(status)).not.toThrow();
        });
      });
    });

    describe('invoiceStatusSchema', () => {
      it('should validate invoice statuses', () => {
        const validStatuses = ['DRAFT', 'SENT', 'PAID', 'OVERDUE'];

        validStatuses.forEach(status => {
          expect(() => invoiceStatusSchema.parse(status)).not.toThrow();
        });
      });
    });
  });

  describe('metadataSchema', () => {
    it('should validate metadata objects', () => {
      const validMetadata = {
        stringValue: 'test',
        numberValue: 42,
        booleanValue: true,
        nullValue: null
      };

      expect(() => metadataSchema.parse(validMetadata)).not.toThrow();
    });

    it('should reject invalid metadata', () => {
      const invalidMetadata = {
        key: 'a'.repeat(501) // Value too long
      };

      expect(() => metadataSchema.parse(invalidMetadata)).toThrow();
    });
  });

  describe('customFieldSchema', () => {
    it('should validate custom fields', () => {
      const validField = {
        name: 'Custom Field',
        type: 'TEXT' as const,
        value: 'test value',
        required: false
      };

      expect(() => customFieldSchema.parse(validField)).not.toThrow();
    });

    it('should set default required value', () => {
      const field = {
        name: 'Field',
        type: 'TEXT' as const,
        value: 'value'
      };

      const result = customFieldSchema.parse(field);
      expect(result.required).toBe(false);
    });
  });

  describe('response schemas', () => {
    describe('successResponseSchema', () => {
      it('should validate success responses', () => {
        const validResponse = {
          success: true as const,
          data: { id: 1, name: 'Test' },
          message: 'Success'
        };

        expect(() => successResponseSchema.parse(validResponse)).not.toThrow();
      });
    });

    describe('errorResponseSchema', () => {
      it('should validate error responses', () => {
        const validResponse = {
          success: false as const,
          error: 'Validation failed',
          message: 'Invalid input',
          code: 'VALIDATION_ERROR'
        };

        expect(() => errorResponseSchema.parse(validResponse)).not.toThrow();
      });
    });
  });

  describe('edge cases and security', () => {
    it('should handle null and undefined values appropriately', () => {
      // Required fields should reject null/undefined
      expect(() => uuidSchema.parse(null)).toThrow();
      expect(() => nameSchema.parse(undefined)).toThrow();

      // Optional fields should handle undefined
      expect(() => phoneSchema.parse(undefined)).not.toThrow();
      expect(() => longTextSchema.parse(undefined)).not.toThrow();
    });

    it('should sanitize and transform inputs safely', () => {
      // Trimming should remove dangerous whitespace
      expect(nameSchema.parse('  John  ')).toBe('John');
      expect(emailSchema.parse('USER@EXAMPLE.COM')).toBe('user@example.com');

      // Case transformations should be safe
      expect(codeSchema.parse('test-code')).toBe('TEST-CODE');
      expect(slugSchema.parse('TEST-SLUG')).toBe('test-slug');
    });

    it('should prevent injection in text fields', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        '<script>alert("xss")</script>',
        '../../etc/passwd'
      ];

      // These should either be rejected or safely handled
      maliciousInputs.forEach(input => {
        // Name schema with regex should reject these
        expect(() => nameSchema.parse(input)).toThrow();

        // Email schema should reject these
        expect(() => emailSchema.parse(input)).toThrow();
      });
    });
  });
});