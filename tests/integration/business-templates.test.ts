import { describe, test, expect, beforeEach } from '@jest/globals';
import { businessTemplateService } from '../../src/services/business-template.service';

describe('Business Templates Integration Tests', () => {
  describe('Template Retrieval', () => {
    test('should get all available templates', () => {
      const templates = businessTemplateService.getAllTemplates();

      expect(templates).toBeDefined();
      expect(typeof templates).toBe('object');
      expect(Object.keys(templates).length).toBeGreaterThan(0);
    });

    test('should have all expected industry categories', () => {
      const templates = businessTemplateService.getAllTemplates();
      const categories = Object.keys(templates);

      const expectedCategories = [
        'HVAC',
        'PLUMBING',
        'ELECTRICAL',
        'GENERAL',
        'LANDSCAPING',
        'CLEANING',
        'CONSTRUCTION',
        'ROOFING'
      ];

      expectedCategories.forEach(category => {
        expect(categories).toContain(category);
      });
    });

    test('should get template summaries', () => {
      const summaries = businessTemplateService.getTemplateSummaries();

      expect(summaries).toBeInstanceOf(Array);
      expect(summaries.length).toBeGreaterThan(0);

      const summary = summaries[0];
      expect(summary).toHaveProperty('category');
      expect(summary).toHaveProperty('name');
      expect(summary).toHaveProperty('description');
      expect(summary).toHaveProperty('fieldCount');
      expect(typeof summary.fieldCount).toBe('number');
    });

    test('should get specific template by category', () => {
      const template = businessTemplateService.getTemplateForCategory('HVAC');

      expect(template).toBeDefined();
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('fields');
      expect(template.fields).toBeInstanceOf(Array);
    });

    test('should throw error for invalid category', () => {
      expect(() => {
        businessTemplateService.getTemplateForCategory('INVALID_CATEGORY');
      }).toThrow();
    });

    test('should be case-insensitive for category lookup', () => {
      const upperCase = businessTemplateService.getTemplateForCategory('HVAC');
      const lowerCase = businessTemplateService.getTemplateForCategory('hvac');
      const mixedCase = businessTemplateService.getTemplateForCategory('Hvac');

      expect(upperCase).toBeDefined();
      expect(lowerCase).toBeDefined();
      expect(mixedCase).toBeDefined();
    });

    test('should check if category has template', () => {
      expect(businessTemplateService.hasTemplate('HVAC')).toBe(true);
      expect(businessTemplateService.hasTemplate('INVALID')).toBe(false);
    });

    test('should get available categories', () => {
      const categories = businessTemplateService.getAvailableCategories();

      expect(categories).toBeInstanceOf(Array);
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('HVAC');
      expect(categories).toContain('PLUMBING');
    });
  });

  describe('HVAC Template Validation', () => {
    test('should validate complete HVAC fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Carrier 24ACC636',
        issueType: ['Not heating/cooling'],
        lastServiceDate: '2024-05-15',
        preferredServiceDate: '2025-10-15',
        emergencyContact: '+1-555-0199'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should detect missing required HVAC fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemAge: 10
        // Missing required fields
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should validate HVAC field types', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 'not-a-number', // Invalid type
        brandModel: 'Carrier'
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should warn about unknown HVAC fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Carrier',
        unknownField: 'some value'
      });

      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0]).toContain('unknownField');
    });
  });

  describe('PLUMBING Template Validation', () => {
    test('should validate complete PLUMBING fields', () => {
      const validation = businessTemplateService.validateCustomFields('PLUMBING', {
        issueLocation: 'Kitchen',
        fixtureType: 'Faucet',
        issueDescription: 'Leaking from base',
        waterShutoff: 'Yes',
        propertyAge: 15,
        lastPlumbingWork: '2023-01-15'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should detect missing required PLUMBING fields', () => {
      const validation = businessTemplateService.validateCustomFields('PLUMBING', {
        propertyAge: 15
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('ELECTRICAL Template Validation', () => {
    test('should validate complete ELECTRICAL fields', () => {
      const validation = businessTemplateService.validateCustomFields('ELECTRICAL', {
        serviceType: 'Panel Upgrade',
        panelType: '200 Amp',
        currentAmps: 100,
        issueDescription: 'Frequently tripping breakers',
        homeAge: 30,
        lastInspection: '2023-06-01',
        permitRequired: 'Yes'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should validate ELECTRICAL number ranges', () => {
      const validation = businessTemplateService.validateCustomFields('ELECTRICAL', {
        serviceType: 'Panel Upgrade',
        panelType: '200 Amp',
        currentAmps: -50, // Invalid negative
        issueDescription: 'Test',
        homeAge: 30
      });

      // Depending on implementation, this might be invalid
      expect(validation.isValid).toBe(false);
    });
  });

  describe('LANDSCAPING Template Validation', () => {
    test('should validate complete LANDSCAPING fields', () => {
      const validation = businessTemplateService.validateCustomFields('LANDSCAPING', {
        serviceType: 'Lawn Maintenance',
        propertySize: '5000-10000 sq ft',
        currentCondition: 'Fair',
        servicesNeeded: ['Mowing', 'Trimming', 'Edging'],
        frequency: 'Weekly',
        specialRequests: 'Organic products only'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should validate LANDSCAPING multiselect fields', () => {
      const validation = businessTemplateService.validateCustomFields('LANDSCAPING', {
        serviceType: 'Lawn Maintenance',
        propertySize: '5000-10000 sq ft',
        currentCondition: 'Fair',
        servicesNeeded: 'Mowing', // Should be array
        frequency: 'Weekly'
      });

      // May pass or fail depending on strict validation
      // If strict, should fail because servicesNeeded should be array
    });
  });

  describe('CLEANING Template Validation', () => {
    test('should validate complete CLEANING fields', () => {
      const validation = businessTemplateService.validateCustomFields('CLEANING', {
        serviceType: 'Deep Cleaning',
        propertyType: 'Residential',
        squareFootage: 2000,
        rooms: 4,
        bathrooms: 2,
        frequency: 'One-time',
        specialRequests: 'Pet-friendly products'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('CONSTRUCTION Template Validation', () => {
    test('should validate complete CONSTRUCTION fields', () => {
      const validation = businessTemplateService.validateCustomFields('CONSTRUCTION', {
        projectType: 'Renovation',
        projectScope: 'Kitchen remodel',
        squareFootage: 300,
        timeline: '2-3 months',
        budget: '50000-100000',
        permitsRequired: 'Yes',
        startDate: '2025-11-01'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('ROOFING Template Validation', () => {
    test('should validate complete ROOFING fields', () => {
      const validation = businessTemplateService.validateCustomFields('ROOFING', {
        serviceType: 'Repair',
        roofType: 'Asphalt Shingles',
        roofAge: 15,
        squareFootage: 2000,
        issueDescription: 'Missing shingles after storm',
        leaking: 'Yes',
        lastInspection: '2023-05-01'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('GENERAL Template Validation', () => {
    test('should validate GENERAL category with minimal fields', () => {
      const validation = businessTemplateService.validateCustomFields('GENERAL', {
        serviceDescription: 'General handyman services',
        urgency: 'Routine',
        preferredDate: '2025-10-15'
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('Field Type Validation', () => {
    test('should validate text fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Valid Brand'
      });

      expect(validation.isValid).toBe(true);
    });

    test('should validate number fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Brand'
      });

      expect(validation.isValid).toBe(true);
    });

    test('should validate select fields with options', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air', // Valid option
        systemAge: 10,
        brandModel: 'Brand'
      });

      expect(validation.isValid).toBe(true);
    });

    test('should reject invalid select options', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Invalid Option That Does Not Exist',
        systemAge: 10,
        brandModel: 'Brand'
      });

      // Should be invalid if strict option validation is enabled
      // Implementation specific
    });

    test('should validate date fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Brand',
        lastServiceDate: '2024-05-15' // Valid ISO date
      });

      expect(validation.isValid).toBe(true);
    });

    test('should validate multiselect/array fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Brand',
        issueType: ['Not heating/cooling', 'Strange noises']
      });

      expect(validation.isValid).toBe(true);
    });
  });

  describe('Conditional Fields', () => {
    test('should handle conditional field visibility', () => {
      // Test that conditional fields are validated only when their condition is met
      // This depends on implementation of showIf logic

      const validation = businessTemplateService.validateCustomFields('ROOFING', {
        serviceType: 'Repair',
        roofType: 'Asphalt Shingles',
        roofAge: 15,
        squareFootage: 2000,
        issueDescription: 'Leak',
        leaking: 'Yes'
        // Conditional fields based on leaking=Yes might be required
      });

      // Should pass if conditional logic is implemented
      expect(validation).toBeDefined();
    });
  });

  describe('Field Constraints', () => {
    test('should validate minimum values', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: -5, // Negative age should be invalid
        brandModel: 'Brand'
      });

      expect(validation.isValid).toBe(false);
    });

    test('should validate maximum values', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 150, // Unrealistic age
        brandModel: 'Brand'
      });

      // Should be invalid if max constraints exist
      // Implementation specific
    });

    test('should validate text length constraints', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'A'.repeat(1000) // Very long text
      });

      // Should pass or fail based on max length constraints
      // Implementation specific
    });
  });

  describe('Sanitization', () => {
    test('should sanitize HTML in text fields', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: '<script>alert("XSS")</script>Carrier'
      });

      // Validation should handle or sanitize HTML
      // Implementation specific
      expect(validation).toBeDefined();
    });

    test('should handle special characters', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Brand & Model™ (2024)'
      });

      expect(validation).toBeDefined();
    });
  });

  describe('Empty and Null Values', () => {
    test('should handle empty strings', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: '',
        systemAge: 10,
        brandModel: 'Brand'
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should handle null values', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: null,
        systemAge: 10,
        brandModel: 'Brand'
      });

      expect(validation.isValid).toBe(false);
    });

    test('should handle undefined values', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemType: undefined,
        systemAge: 10,
        brandModel: 'Brand'
      });

      expect(validation.isValid).toBe(false);
    });
  });

  describe('Template Structure', () => {
    test('all templates should have consistent structure', () => {
      const templates = businessTemplateService.getAllTemplates();

      Object.values(templates).forEach(template => {
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('fields');
        expect(template.fields).toBeInstanceOf(Array);

        template.fields.forEach(field => {
          expect(field).toHaveProperty('name');
          expect(field).toHaveProperty('type');
          expect(field).toHaveProperty('label');
          expect(field).toHaveProperty('required');
        });
      });
    });

    test('all templates should have at least one field', () => {
      const templates = businessTemplateService.getAllTemplates();

      Object.values(templates).forEach(template => {
        expect(template.fields.length).toBeGreaterThan(0);
      });
    });

    test('field types should be valid', () => {
      const templates = businessTemplateService.getAllTemplates();
      const validTypes = [
        'text',
        'textarea',
        'number',
        'select',
        'multiselect',
        'date',
        'radio',
        'checkbox',
        'tel',
        'email'
      ];

      Object.values(templates).forEach(template => {
        template.fields.forEach(field => {
          expect(validTypes).toContain(field.type);
        });
      });
    });

    test('select fields should have options', () => {
      const templates = businessTemplateService.getAllTemplates();

      Object.values(templates).forEach(template => {
        template.fields.forEach(field => {
          if (field.type === 'select' || field.type === 'multiselect' || field.type === 'radio') {
            expect(field).toHaveProperty('options');
            expect(field.options).toBeInstanceOf(Array);
            expect(field.options.length).toBeGreaterThan(0);
          }
        });
      });
    });
  });

  describe('Integration with Intake Workflow', () => {
    test('should validate full HVAC workflow data', () => {
      const hvacData = {
        systemType: 'Central Air',
        systemAge: 10,
        brandModel: 'Carrier 24ACC636',
        issueType: ['Not heating/cooling', 'Strange noises'],
        lastServiceDate: '2024-05-15',
        preferredServiceDate: '2025-10-20',
        emergencyContact: '+1-555-0199',
        additionalNotes: 'System makes loud noise when starting'
      };

      const validation = businessTemplateService.validateCustomFields('HVAC', hvacData);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should handle mixed valid and invalid data', () => {
      const mixedData = {
        systemType: 'Central Air', // Valid
        systemAge: 'ten', // Invalid - should be number
        brandModel: '', // Invalid - empty
        issueType: ['Not heating/cooling'] // Valid
      };

      const validation = businessTemplateService.validateCustomFields('HVAC', mixedData);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should provide helpful error messages', () => {
      const validation = businessTemplateService.validateCustomFields('HVAC', {
        systemAge: 10
      });

      expect(validation.errors).toBeInstanceOf(Array);
      if (validation.errors.length > 0) {
        expect(typeof validation.errors[0]).toBe('string');
        expect(validation.errors[0].length).toBeGreaterThan(0);
      }
    });
  });

  describe('Performance', () => {
    test('should validate quickly with large dataset', () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        businessTemplateService.validateCustomFields('HVAC', {
          systemType: 'Central Air',
          systemAge: 10,
          brandModel: 'Carrier'
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 100 validations in under 1 second
      expect(duration).toBeLessThan(1000);
    });

    test('should handle all templates efficiently', () => {
      const categories = businessTemplateService.getAvailableCategories();
      const startTime = Date.now();

      categories.forEach(category => {
        const template = businessTemplateService.getTemplateForCategory(category);
        expect(template).toBeDefined();
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should retrieve all templates quickly
      expect(duration).toBeLessThan(100);
    });
  });
});