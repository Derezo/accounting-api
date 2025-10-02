// @ts-nocheck
/**
 * Comprehensive Invoice PDF Generation Test Suite
 * Tests all customization options, templates, styles, and edge cases
 */

import supertest from 'supertest';
import { Application } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { testApp as app, prisma, createTestToken } from './setup';
import { createTestInvoice, createTestOrganization, createTestCustomer, createTestUser } from './test-utils';

describe('Invoice PDF Generation Integration Tests', () => {
  let authToken: string;
  let organizationId: string;
  let customerId: string;
  let invoiceId: string;
  let testUserId: string;

  beforeEach(async () => {
    // Create test organization and user
    const testOrg = await createTestOrganization(prisma);
    organizationId = testOrg.id;

    // Create test user for audit logging
    const testUser = await createTestUser(prisma, organizationId, 'ADMIN');
    testUserId = testUser.id;
    authToken = createTestToken({ organizationId, role: 'ADMIN', userId: testUserId });

    // Create test customer and invoice
    const customer = await createTestCustomer(prisma, organizationId);
    customerId = customer.id;

    // Create invoice using the correct API
    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        customerId,
        invoiceNumber: 'TEST-PDF-001',
        status: 'SENT',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currency: 'CAD',
        exchangeRate: 1.0,
        subtotal: 1000.00,
        taxAmount: 130.00,
        total: 1130.00,
        depositRequired: 0,
        amountPaid: 0,
        balance: 1130.00,
        terms: 'Net 30 days'
      }
    });
    invoiceId = invoice.id;
  });

  describe('Basic PDF Generation', () => {
    test('should generate PDF with default template and style', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.body.length).toBeGreaterThan(1000); // Ensure PDF has content
    });

    test('should generate PDF with A4 format', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ format: 'A4' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with Letter format', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ format: 'Letter' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with landscape orientation', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ orientation: 'landscape' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Template System Tests', () => {
    let defaultTemplateId: string;
    let modernTemplateId: string;
    let minimalTemplateId: string;

    beforeEach(async () => {
      // Initialize system templates via service
      const { invoiceTemplateService } = await import('../../src/services/invoice-template.service');
      await invoiceTemplateService.initializeSystemTemplatesAndStyles(organizationId, {
        userId: testUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'test'
      });

      // Get template IDs
      const templatesResponse = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templates = templatesResponse.body.data.templates;
      defaultTemplateId = templates.find((t: any) => t.name.includes('Default'))?.id;
      modernTemplateId = templates.find((t: any) => t.name.includes('Modern'))?.id;
      minimalTemplateId = templates.find((t: any) => t.name.includes('Minimal'))?.id;
    });

    test('should generate PDF with default template', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId: defaultTemplateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(1000);
    });

    test('should generate PDF with modern template', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId: modernTemplateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with minimal template', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId: minimalTemplateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Style System Tests', () => {
    let classicStyleId: string;
    let modernStyleId: string;
    let corporateStyleId: string;

    beforeEach(async () => {
      // Initialize system templates and styles via service
      const { invoiceTemplateService } = await import('../../src/services/invoice-template.service');
      await invoiceTemplateService.initializeSystemTemplatesAndStyles(organizationId, {
        userId: testUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'test'
      });

      // Get style IDs
      const stylesResponse = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const styles = stylesResponse.body.data.styles;
      classicStyleId = styles.find((s: any) => s.name.includes('Classic'))?.id;
      modernStyleId = styles.find((s: any) => s.name.includes('Modern'))?.id;
      corporateStyleId = styles.find((s: any) => s.name.includes('Corporate'))?.id;
    });

    test('should generate PDF with classic style', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ styleId: classicStyleId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with modern blue style', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ styleId: modernStyleId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with corporate gray style', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ styleId: corporateStyleId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Organization Branding Tests', () => {
    test('should generate PDF with logo display enabled', async () => {
      // Update branding settings to show logo
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: true,
          showOrgName: false,
          primaryColor: '#2563eb'
        })
        .expect(200);

      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with organization name display enabled', async () => {
      // Update branding settings to show org name
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: false,
          showOrgName: true,
          primaryColor: '#000000'
        })
        .expect(200);

      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with custom color scheme', async () => {
      // Set custom colors
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          primaryColor: '#10b981',
          secondaryColor: '#374151',
          accentColor: '#059669',
          backgroundColor: '#f9fafb',
          textColor: '#111827'
        })
        .expect(200);

      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Tax Disable Functionality', () => {
    test('should generate PDF with taxes disabled', async () => {
      // Disable taxes for organization
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: false,
          defaultTaxExempt: true
        })
        .expect(200);

      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      // PDF should not show tax sections when disabled
    });

    test('should generate PDF with taxes enabled', async () => {
      // Enable taxes for organization
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: true,
          defaultTaxExempt: false
        })
        .expect(200);

      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Complex Customization Scenarios', () => {
    test('should generate PDF with full customization', async () => {
      // Initialize templates and styles via service
      const { invoiceTemplateService } = await import('../../src/services/invoice-template.service');
      await invoiceTemplateService.initializeSystemTemplatesAndStyles(organizationId, {
        userId: testUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'test'
      });

      // Get available templates and styles
      const templatesResponse = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const stylesResponse = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templates = templatesResponse.body.data.templates;
      const styles = stylesResponse.body.data.styles;
      const modernTemplate = templates.find((t: any) => t.name.includes('Modern'));
      const blueStyle = styles.find((s: any) => s.name.includes('Modern'));

      // Update organization settings
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: false,
          showOrgName: true,
          primaryColor: '#3b82f6',
          secondaryColor: '#64748b',
          accentColor: '#2563eb',
          backgroundColor: '#ffffff',
          textColor: '#1e293b',
          displaySettings: {
            showCompanyDetails: true,
            showPaymentTerms: true,
            showNotes: true
          },
          customCss: '.invoice { font-family: Arial, sans-serif; border: 1px solid #e5e7eb; }'
        })
        .expect(200);

      // Generate PDF with all customizations
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({
          templateId: modernTemplate.id,
          styleId: blueStyle.id,
          format: 'Letter',
          orientation: 'portrait'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('TEST-PDF-001');
    });
  });

  describe('PDF Regeneration Tests', () => {
    test('should regenerate PDF with new settings', async () => {
      // Generate initial PDF
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Regenerate with new settings
      const response = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf/regenerate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          format: 'A4',
          orientation: 'landscape'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pdf).toBeDefined();
      expect(response.body.data.pdf.status).toBe('GENERATED');
    });

    test('should force regeneration with regenerate=true query param', async () => {
      // Generate initial PDF
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Force regeneration
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ regenerate: 'true' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('PDF Status Tracking', () => {
    test('should track PDF generation status', async () => {
      // Generate PDF
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check status
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pdfs).toBeDefined();
      expect(response.body.data.pdfs.length).toBeGreaterThan(0);
      expect(response.body.data.pdfs[0].status).toBe('GENERATED');
    });

    test('should filter status by template and style', async () => {
      // Initialize system templates via service
      const { invoiceTemplateService } = await import('../../src/services/invoice-template.service');
      await invoiceTemplateService.initializeSystemTemplatesAndStyles(organizationId, {
        userId: testUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'test'
      });

      const templatesResponse = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templateId = templatesResponse.body.data.templates[0].id;

      // Generate PDF with specific template
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check filtered status
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf/status`)
        .query({ templateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pdfs).toBeDefined();
      expect(response.body.data.pdfs[0].templateId).toBe(templateId);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for non-existent invoice', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/nonexistent/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should return 403 for wrong organization', async () => {
      const otherOrg = await createTestOrganization(prisma);

      const response = await supertest(app)
        .get(`/api/v1/organizations/${otherOrg.id}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('should validate invalid template ID', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId: 'invalid-template-id' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should validate invalid style ID', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ styleId: 'invalid-style-id' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent PDF generation requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        supertest(app)
          .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.body.length).toBeGreaterThan(1000);
      });
    });

    test('should cache and reuse PDFs when appropriate', async () => {
      const start1 = Date.now();
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration1 = Date.now() - start1;

      const start2 = Date.now();
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration2 = Date.now() - start2;

      // Second request should be faster due to caching
      expect(duration2).toBeLessThan(duration1);
    });
  });

  describe('Template CRUD Operations', () => {
    let templateId: string;

    beforeEach(async () => {
      // Initialize system templates via service
      const { invoiceTemplateService } = await import('../../src/services/invoice-template.service');
      await invoiceTemplateService.initializeSystemTemplatesAndStyles(organizationId, {
        userId: testUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'test'
      });

      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      templateId = response.body.data.templates[0].id;
    });

    test('should get single template by ID', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/templates/${templateId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.template).toBeDefined();
      expect(response.body.data.template.id).toBe(templateId);
      expect(response.body.data.template.name).toBeDefined();
      expect(response.body.data.template.htmlTemplate).toBeDefined();
      expect(response.body.data.template.styles).toBeDefined();
      expect(Array.isArray(response.body.data.template.styles)).toBe(true);
    });

    test('should return 404 for non-existent template', async () => {
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/templates/invalid-id`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should create custom template', async () => {
      const response = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Custom Test Template',
          description: 'Test custom template',
          templateType: 'CUSTOM',
          htmlTemplate: '<html><body>{{invoiceNumber}}</body></html>',
          tags: ['test', 'custom']
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.template.name).toBe('Custom Test Template');
      expect(response.body.data.template.isSystem).toBe(false);
    });

    test('should update custom template', async () => {
      // First create a custom template
      const createResponse = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Update Test Template',
          templateType: 'CUSTOM',
          htmlTemplate: '<html><body>Original</body></html>'
        })
        .expect(201);

      const customTemplateId = createResponse.body.data.template.id;

      // Update the template
      const updateResponse = await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/invoices/templates/${customTemplateId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Test Template',
          description: 'Updated description',
          htmlTemplate: '<html><body>Updated</body></html>'
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.template.name).toBe('Updated Test Template');
      expect(updateResponse.body.data.template.description).toBe('Updated description');
    });

    test('should not update system template', async () => {
      // Try to update a system template
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/invoices/templates/${templateId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Should Not Update'
        })
        .expect(400);
    });

    test('should delete custom template', async () => {
      // Create a custom template
      const createResponse = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Delete Test Template',
          templateType: 'CUSTOM',
          htmlTemplate: '<html><body>Delete</body></html>'
        })
        .expect(201);

      const customTemplateId = createResponse.body.data.template.id;

      // Delete it
      await supertest(app)
        .delete(`/api/v1/organizations/${organizationId}/invoices/templates/${customTemplateId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify it's deleted
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/templates/${customTemplateId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should not delete system template', async () => {
      await supertest(app)
        .delete(`/api/v1/organizations/${organizationId}/invoices/templates/${templateId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('Style CRUD Operations', () => {
    let styleId: string;

    beforeEach(async () => {
      // Initialize system templates and styles via service
      const { invoiceTemplateService } = await import('../../src/services/invoice-template.service');
      await invoiceTemplateService.initializeSystemTemplatesAndStyles(organizationId, {
        userId: testUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'test'
      });

      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      styleId = response.body.data.styles[0].id;
    });

    test('should get single style by ID', async () => {
      const response = await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/styles/${styleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.style).toBeDefined();
      expect(response.body.data.style.id).toBe(styleId);
      expect(response.body.data.style.name).toBeDefined();
      expect(response.body.data.style.cssContent).toBeDefined();
      expect(response.body.data.style.colorScheme).toBeDefined();
      expect(response.body.data.style.template).toBeDefined();
    });

    test('should return 404 for non-existent style', async () => {
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/styles/invalid-id`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should create custom style', async () => {
      const response = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Custom Test Style',
          description: 'Test custom style',
          cssContent: '.invoice { color: red; }',
          colorScheme: {
            primary: '#ff0000',
            secondary: '#00ff00',
            accent: '#0000ff',
            background: '#ffffff',
            text: '#000000'
          },
          fontFamily: 'Arial, sans-serif',
          tags: ['test', 'custom']
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.style.name).toBe('Custom Test Style');
      expect(response.body.data.style.isSystem).toBe(false);
    });

    test('should update custom style', async () => {
      // Create a custom style
      const createResponse = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Update Test Style',
          cssContent: '.invoice { color: blue; }',
          colorScheme: {
            primary: '#0000ff',
            secondary: '#00ff00',
            accent: '#ff0000',
            background: '#ffffff',
            text: '#000000'
          }
        })
        .expect(201);

      const customStyleId = createResponse.body.data.style.id;

      // Update the style
      const updateResponse = await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/invoices/styles/${customStyleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Test Style',
          description: 'Updated style description',
          cssContent: '.invoice { color: green; }',
          colorScheme: {
            primary: '#00ff00',
            secondary: '#0000ff',
            accent: '#ff0000',
            background: '#ffffff',
            text: '#000000'
          }
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.style.name).toBe('Updated Test Style');
      expect(updateResponse.body.data.style.description).toBe('Updated style description');
    });

    test('should not update system style', async () => {
      await supertest(app)
        .put(`/api/v1/organizations/${organizationId}/invoices/styles/${styleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Should Not Update'
        })
        .expect(400);
    });

    test('should delete custom style', async () => {
      // Create a custom style
      const createResponse = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Delete Test Style',
          cssContent: '.invoice { color: red; }',
          colorScheme: {
            primary: '#ff0000',
            secondary: '#00ff00',
            accent: '#0000ff',
            background: '#ffffff',
            text: '#000000'
          }
        })
        .expect(201);

      const customStyleId = createResponse.body.data.style.id;

      // Delete it
      await supertest(app)
        .delete(`/api/v1/organizations/${organizationId}/invoices/styles/${customStyleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify it's deleted
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/styles/${customStyleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should not delete system style', async () => {
      await supertest(app)
        .delete(`/api/v1/organizations/${organizationId}/invoices/styles/${styleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    test('should not delete default style', async () => {
      // Create and set as default
      const createResponse = await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Default Test Style',
          cssContent: '.invoice { color: red; }',
          colorScheme: {
            primary: '#ff0000',
            secondary: '#00ff00',
            accent: '#0000ff',
            background: '#ffffff',
            text: '#000000'
          },
          isDefault: true
        })
        .expect(201);

      const customStyleId = createResponse.body.data.style.id;

      // Try to delete it
      await supertest(app)
        .delete(`/api/v1/organizations/${organizationId}/invoices/styles/${customStyleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('Security Tests', () => {
    test('should require authentication', async () => {
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .expect(401);
    });

    test('should validate organization access', async () => {
      // Create another organization and an invoice that belongs to it
      const otherOrg = await createTestOrganization(prisma);
      const otherCustomer = await createTestCustomer(prisma, otherOrg.id);
      const otherInvoice = await prisma.invoice.create({
        data: {
          organizationId: otherOrg.id,
          customerId: otherCustomer.id,
          invoiceNumber: 'OTHER-ORG-001',
          status: 'SENT',
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          currency: 'CAD',
          exchangeRate: 1.0,
          subtotal: 500.00,
          taxAmount: 65.00,
          total: 565.00,
          depositRequired: 0,
          amountPaid: 0,
          balance: 565.00,
          terms: 'Net 30 days'
        }
      });

      // Try to access other org's invoice using current org's credentials
      // This should be denied because the invoice belongs to a different organization
      await supertest(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${otherInvoice.id}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });

    test('should validate user permissions for regeneration', async () => {
      const viewerToken = createTestToken({ organizationId, role: 'VIEWER' });

      await supertest(app)
        .post(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf/regenerate`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });
});

/**
 * Helper function to create test invoice with line items
 */
async function createTestInvoiceWithLineItems(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string
) {
  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      customerId,
      number: 'TEST-PDF-COMPLEX',
      date: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'SENT',
      subtotal: 2500.00,
      taxAmount: 325.00,
      totalAmount: 2825.00,
      notes: 'This is a test invoice with multiple line items for PDF generation testing.',
      lineItems: {
        create: [
          {
            description: 'Professional Consulting Services',
            quantity: 10,
            unitPrice: 150.00,
            totalPrice: 1500.00,
            organizationId
          },
          {
            description: 'Software Development',
            quantity: 5,
            unitPrice: 200.00,
            totalPrice: 1000.00,
            organizationId
          }
        ]
      }
    },
    include: {
      lineItems: true,
      customer: true
    }
  });

  return invoice;
}