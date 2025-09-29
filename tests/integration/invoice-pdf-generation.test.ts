/**
 * Comprehensive Invoice PDF Generation Test Suite
 * Tests all customization options, templates, styles, and edge cases
 */

import request from 'supertest';
import { Application } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { setupTestApp, cleanupTestApp, createTestToken } from '../setup';
import { createTestInvoice, createTestOrganization, createTestCustomer } from '../test-utils';

describe('Invoice PDF Generation Integration Tests', () => {
  let app: Application;
  let prisma: PrismaClient;
  let authToken: string;
  let organizationId: string;
  let customerId: string;
  let invoiceId: string;

  beforeAll(async () => {
    const testApp = await setupTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await cleanupTestApp();
  });

  beforeEach(async () => {
    // Create test organization and user
    const testOrg = await createTestOrganization(prisma);
    organizationId = testOrg.id;
    authToken = createTestToken({ organizationId, role: 'ADMIN' });

    // Create test customer and invoice
    const customer = await createTestCustomer(prisma, organizationId);
    customerId = customer.id;

    const invoice = await createTestInvoice(prisma, {
      organizationId,
      customerId,
      number: 'TEST-PDF-001',
      subtotal: 1000.00,
      taxAmount: 130.00,
      totalAmount: 1130.00,
      status: 'SENT'
    });
    invoiceId = invoice.id;
  });

  describe('Basic PDF Generation', () => {
    test('should generate PDF with default template and style', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.body.length).toBeGreaterThan(1000); // Ensure PDF has content
    });

    test('should generate PDF with A4 format', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ format: 'A4' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with Letter format', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ format: 'Letter' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with landscape orientation', async () => {
      const response = await request(app)
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
      // Initialize system templates
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Get template IDs
      const templatesResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoice-templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templates = templatesResponse.body.data.templates;
      defaultTemplateId = templates.find((t: any) => t.name.includes('Default'))?.id;
      modernTemplateId = templates.find((t: any) => t.name.includes('Modern'))?.id;
      minimalTemplateId = templates.find((t: any) => t.name.includes('Minimal'))?.id;
    });

    test('should generate PDF with default template', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId: defaultTemplateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(1000);
    });

    test('should generate PDF with modern template', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId: modernTemplateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with minimal template', async () => {
      const response = await request(app)
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
      // Initialize system templates and styles
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Get style IDs
      const stylesResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoice-styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const styles = stylesResponse.body.data.styles;
      classicStyleId = styles.find((s: any) => s.name.includes('Classic'))?.id;
      modernStyleId = styles.find((s: any) => s.name.includes('Modern'))?.id;
      corporateStyleId = styles.find((s: any) => s.name.includes('Corporate'))?.id;
    });

    test('should generate PDF with classic style', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ styleId: classicStyleId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with modern blue style', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ styleId: modernStyleId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with corporate gray style', async () => {
      const response = await request(app)
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
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: true,
          showOrgName: false,
          primaryColor: '#2563eb'
        })
        .expect(200);

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with organization name display enabled', async () => {
      // Update branding settings to show org name
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: false,
          showOrgName: true,
          primaryColor: '#000000'
        })
        .expect(200);

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should generate PDF with custom color scheme', async () => {
      // Set custom colors
      await request(app)
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

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Tax Disable Functionality', () => {
    test('should generate PDF with taxes disabled', async () => {
      // Disable taxes for organization
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: false,
          defaultTaxExempt: true
        })
        .expect(200);

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      // PDF should not show tax sections when disabled
    });

    test('should generate PDF with taxes enabled', async () => {
      // Enable taxes for organization
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: true,
          defaultTaxExempt: false
        })
        .expect(200);

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Complex Customization Scenarios', () => {
    test('should generate PDF with full customization', async () => {
      // Initialize templates and styles
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Get available templates and styles
      const templatesResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoice-templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const stylesResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoice-styles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templates = templatesResponse.body.data.templates;
      const styles = stylesResponse.body.data.styles;
      const modernTemplate = templates.find((t: any) => t.name.includes('Modern'));
      const blueStyle = styles.find((s: any) => s.name.includes('Modern'));

      // Update organization settings
      await request(app)
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
      const response = await request(app)
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
      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Regenerate with new settings
      const response = await request(app)
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
      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Force regeneration
      const response = await request(app)
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
      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check status
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pdfs).toBeDefined();
      expect(response.body.data.pdfs.length).toBeGreaterThan(0);
      expect(response.body.data.pdfs[0].status).toBe('GENERATED');
    });

    test('should filter status by template and style', async () => {
      // Initialize system templates
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      const templatesResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoice-templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templateId = templatesResponse.body.data.templates[0].id;

      // Generate PDF with specific template
      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check filtered status
      const response = await request(app)
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
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/nonexistent/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should return 403 for wrong organization', async () => {
      const otherOrg = await createTestOrganization(prisma);

      const response = await request(app)
        .get(`/api/v1/organizations/${otherOrg.id}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('should validate invalid template ID', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .query({ templateId: 'invalid-template-id' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should validate invalid style ID', async () => {
      const response = await request(app)
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
        request(app)
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
      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration2 = Date.now() - start2;

      // Second request should be faster due to caching
      expect(duration2).toBeLessThan(duration1);
    });
  });

  describe('Security Tests', () => {
    test('should require authentication', async () => {
      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .expect(401);
    });

    test('should validate organization access', async () => {
      const unauthorizedToken = createTestToken({ organizationId: 'other-org', role: 'ADMIN' });

      await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .expect(403);
    });

    test('should validate user permissions for regeneration', async () => {
      const viewerToken = createTestToken({ organizationId, role: 'VIEWER' });

      await request(app)
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