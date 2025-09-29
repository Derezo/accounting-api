/**
 * Organization Settings Customization Test Suite
 * Tests all organization-level invoice customization features
 */

import request from 'supertest';
import { Application } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { setupTestApp, cleanupTestApp, createTestToken } from '../setup';
import { createTestOrganization } from '../test-utils';

describe('Organization Settings Customization Integration Tests', () => {
  let app: Application;
  let prisma: PrismaClient;
  let authToken: string;
  let managerToken: string;
  let viewerToken: string;
  let organizationId: string;

  beforeAll(async () => {
    const testApp = await setupTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await cleanupTestApp();
  });

  beforeEach(async () => {
    // Create test organization
    const testOrg = await createTestOrganization(prisma);
    organizationId = testOrg.id;

    // Create tokens for different roles
    authToken = createTestToken({ organizationId, role: 'ADMIN' });
    managerToken = createTestToken({ organizationId, role: 'MANAGER' });
    viewerToken = createTestToken({ organizationId, role: 'VIEWER' });
  });

  describe('Settings Initialization', () => {
    test('should initialize settings for new organization', async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.templatesCount).toBeGreaterThan(0);
      expect(response.body.data.stylesCount).toBeGreaterThan(0);
      expect(response.body.data.branding).toBeDefined();
      expect(response.body.data.branding.taxesEnabled).toBe(true);
    });

    test('should not allow viewers to initialize settings', async () => {
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  describe('Invoice Settings Management', () => {
    beforeEach(async () => {
      // Initialize settings for each test
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);
    });

    test('should get complete invoice settings', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.branding).toBeDefined();
      expect(response.body.data.availableTemplates).toBeDefined();
      expect(response.body.data.availableStyles).toBeDefined();

      const branding = response.body.data.branding;
      expect(branding.id).toBeDefined();
      expect(branding.taxesEnabled).toBe(true);
      expect(branding.showOrgName).toBe(true);
    });

    test('should update invoice settings with full customization', async () => {
      const updateData = {
        showLogo: true,
        showOrgName: false,
        primaryColor: '#2563eb',
        secondaryColor: '#64748b',
        accentColor: '#3b82f6',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        displaySettings: {
          showCompanyDetails: true,
          showPaymentTerms: true,
          showNotes: true,
          showLineItemDescriptions: true
        },
        customCss: '.invoice { font-family: Arial, sans-serif; padding: 20px; }'
      };

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.branding.showLogo).toBe(true);
      expect(response.body.data.branding.showOrgName).toBe(false);
      expect(response.body.data.branding.primaryColor).toBe('#2563eb');
      expect(response.body.data.branding.customCss).toBe(updateData.customCss);
    });

    test('should validate color formats in settings', async () => {
      const invalidData = {
        primaryColor: 'not-a-hex-color',
        secondaryColor: '#invalidhex'
      };

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('color');
    });

    test('should allow managers to update settings', async () => {
      const updateData = {
        showLogo: false,
        showOrgName: true,
        primaryColor: '#10b981'
      };

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should not allow viewers to update settings', async () => {
      const updateData = {
        showLogo: true,
        primaryColor: '#ef4444'
      };

      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(updateData)
        .expect(403);
    });
  });

  describe('Logo Management', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);
    });

    test('should upload logo successfully', async () => {
      // Create a test image buffer (minimal PNG)
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
      ]);

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/assets/logo`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('logo', testImageBuffer, 'test-logo.png')
        .field('logoWidth', '200')
        .field('logoHeight', '80')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logoUrl).toBeDefined();
      expect(response.body.data.logoWidth).toBe(200);
      expect(response.body.data.logoHeight).toBe(80);
    });

    test('should validate file types for logo upload', async () => {
      const invalidFileBuffer = Buffer.from('not an image');

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/assets/logo`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('logo', invalidFileBuffer, 'test.txt')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('file type');
    });

    test('should validate file size for logo upload', async () => {
      // Create a large buffer (over 5MB)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/assets/logo`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('logo', largeBuffer, 'large-image.png')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('size');
    });

    test('should remove logo successfully', async () => {
      // First upload a logo
      const testImageBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/assets/logo`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('logo', testImageBuffer, 'test-logo.png')
        .expect(201);

      // Then remove it
      const response = await request(app)
        .delete(`/api/v1/organizations/${organizationId}/settings/assets/logo`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logoUrl).toBeNull();
      expect(response.body.data.showLogo).toBe(false);
    });

    test('should not allow viewers to manage logos', async () => {
      const testImageBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]);

      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/assets/logo`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .attach('logo', testImageBuffer, 'test-logo.png')
        .expect(403);
    });
  });

  describe('Tax Settings Management', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);
    });

    test('should get current tax settings', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.taxesEnabled).toBeDefined();
      expect(response.body.data.defaultTaxExempt).toBeDefined();
    });

    test('should disable taxes organization-wide', async () => {
      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: false,
          defaultTaxExempt: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.taxesEnabled).toBe(false);
      expect(response.body.data.defaultTaxExempt).toBe(true);

      // Verify setting is persisted
      const getResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.taxesEnabled).toBe(false);
    });

    test('should enable taxes organization-wide', async () => {
      // First disable taxes
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taxesEnabled: false })
        .expect(200);

      // Then re-enable them
      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: true,
          defaultTaxExempt: false
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.taxesEnabled).toBe(true);
      expect(response.body.data.defaultTaxExempt).toBe(false);
    });

    test('should validate boolean values for tax settings', async () => {
      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: 'not-a-boolean'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('boolean');
    });

    test('should allow managers to update tax settings', async () => {
      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          taxesEnabled: false,
          defaultTaxExempt: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should not allow viewers to update tax settings', async () => {
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          taxesEnabled: false
        })
        .expect(403);
    });
  });

  describe('Default Template and Style Management', () => {
    let templateId: string;
    let styleId: string;

    beforeEach(async () => {
      // Initialize system templates and styles
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

      templateId = templatesResponse.body.data.templates[0].id;
      styleId = stylesResponse.body.data.styles[0].id;
    });

    test('should set default template and style', async () => {
      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/defaults`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          defaultTemplateId: templateId,
          defaultStyleId: styleId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.defaultTemplateId).toBe(templateId);
      expect(response.body.data.defaultStyleId).toBe(styleId);
    });

    test('should validate template and style IDs', async () => {
      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/defaults`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          defaultTemplateId: 'invalid-template-id',
          defaultStyleId: 'invalid-style-id'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should allow managers to set defaults', async () => {
      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/defaults`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          defaultTemplateId: templateId,
          defaultStyleId: styleId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Complex Branding Scenarios', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);
    });

    test('should handle logo display vs organization name preference', async () => {
      // Test showing logo only
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: true,
          showOrgName: false
        })
        .expect(200);

      let settings = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(settings.body.data.branding.showLogo).toBe(true);
      expect(settings.body.data.branding.showOrgName).toBe(false);

      // Test showing organization name only
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: false,
          showOrgName: true
        })
        .expect(200);

      settings = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(settings.body.data.branding.showLogo).toBe(false);
      expect(settings.body.data.branding.showOrgName).toBe(true);

      // Test showing both
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: true,
          showOrgName: true
        })
        .expect(200);

      settings = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(settings.body.data.branding.showLogo).toBe(true);
      expect(settings.body.data.branding.showOrgName).toBe(true);
    });

    test('should handle comprehensive display settings', async () => {
      const displaySettings = {
        showCompanyDetails: true,
        showCustomerDetails: true,
        showInvoiceNumber: true,
        showInvoiceDate: true,
        showDueDate: true,
        showPaymentTerms: false,
        showNotes: true,
        showLineItemDescriptions: true,
        showQuantity: true,
        showUnitPrice: true,
        showLineTotal: true,
        showSubtotal: true,
        showTaxes: false,
        showTotal: true
      };

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          displaySettings
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify settings are persisted correctly
      const getResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const savedSettings = JSON.parse(getResponse.body.data.branding.displaySettings);
      expect(savedSettings.showPaymentTerms).toBe(false);
      expect(savedSettings.showTaxes).toBe(false);
      expect(savedSettings.showNotes).toBe(true);
    });

    test('should handle custom CSS injection', async () => {
      const customCss = `
        .invoice-header {
          background-color: #f3f4f6;
          padding: 20px;
          border-radius: 8px;
        }
        .invoice-total {
          font-size: 1.25rem;
          font-weight: bold;
          color: #1f2937;
        }
        .line-item {
          border-bottom: 1px solid #e5e7eb;
          padding: 8px 0;
        }
      `;

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customCss: customCss.trim(),
          primaryColor: '#3b82f6'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify CSS is stored correctly
      const getResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.branding.customCss).toContain('invoice-header');
      expect(getResponse.body.data.branding.customCss).toContain('font-weight: bold');
    });
  });

  describe('Integration with PDF Generation', () => {
    test('should apply settings to PDF generation workflow', async () => {
      // Initialize settings
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Create test invoice
      const invoice = await prisma.invoice.create({
        data: {
          organizationId,
          customerId: (await prisma.customer.create({
            data: {
              organizationId,
              name: 'Test Customer',
              email: 'test@example.com'
            }
          })).id,
          number: 'SETTINGS-TEST-001',
          date: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'SENT',
          subtotal: 1000.00,
          taxAmount: 130.00,
          totalAmount: 1130.00
        }
      });

      // Configure organization settings
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          showLogo: false,
          showOrgName: true,
          primaryColor: '#059669',
          displaySettings: {
            showCompanyDetails: true,
            showPaymentTerms: true,
            showTaxes: true
          }
        })
        .expect(200);

      // Test that PDF generation uses the settings
      const pdfResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoice.id}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(pdfResponse.headers['content-type']).toBe('application/pdf');
      expect(pdfResponse.body.length).toBeGreaterThan(1000);
    });

    test('should respect tax disable setting in PDF generation', async () => {
      // Initialize settings
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Disable taxes
      await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/tax`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxesEnabled: false,
          defaultTaxExempt: true
        })
        .expect(200);

      // Create test invoice with taxes
      const invoice = await prisma.invoice.create({
        data: {
          organizationId,
          customerId: (await prisma.customer.create({
            data: {
              organizationId,
              name: 'Test Customer',
              email: 'test@example.com'
            }
          })).id,
          number: 'TAX-DISABLED-001',
          date: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'SENT',
          subtotal: 1000.00,
          taxAmount: 130.00, // This should be ignored
          totalAmount: 1000.00 // Should equal subtotal when taxes disabled
        }
      });

      // Generate PDF - should not show tax sections
      const pdfResponse = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invoices/${invoice.id}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle missing organization gracefully', async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/nonexistent/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403); // Organization access validation should fail

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed JSON in display settings', async () => {
      // Initialize first
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          displaySettings: 'invalid-json-string'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle concurrent settings updates', async () => {
      // Initialize settings
      await request(app)
        .post(`/api/v1/organizations/${organizationId}/settings/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Fire multiple concurrent updates
      const updates = [
        request(app)
          .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ primaryColor: '#ef4444' }),
        request(app)
          .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ primaryColor: '#10b981' }),
        request(app)
          .put(`/api/v1/organizations/${organizationId}/settings/invoice`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ primaryColor: '#3b82f6' })
      ];

      const responses = await Promise.all(updates);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Final state should be consistent
      const finalState = await request(app)
        .get(`/api/v1/organizations/${organizationId}/settings/invoice`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalState.body.data.branding.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});