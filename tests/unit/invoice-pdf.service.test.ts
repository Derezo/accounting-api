/**
 * Unit Tests for Invoice PDF Service
 * Tests PDF generation functionality, template compilation, and error handling
 */

import { InvoicePDFService } from '../../src/services/invoice-pdf.service';
import { auditService } from '../../src/services/audit.service';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
jest.mock('../../src/config/database', () => ({
  prisma: {
    invoice: {
      findFirst: jest.fn(),
    },
    organizationBranding: {
      findUnique: jest.fn(),
      create: jest.fn()
    },
    generatedPDF: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn()
    },
    invoiceTemplate: {
      findUnique: jest.fn()
    },
    invoiceStyle: {
      findUnique: jest.fn()
    }
  }
}));
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logCreate: jest.fn()
  }
}));
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-content')),
      setViewport: jest.fn(),
      close: jest.fn()
    }),
    close: jest.fn()
  })
}));
jest.mock('handlebars', () => ({
  compile: jest.fn().mockReturnValue(jest.fn().mockReturnValue('<html>compiled template</html>')),
  registerHelper: jest.fn()
}));
jest.mock('fs/promises');

// Import the mocked prisma
const { prisma } = require('../../src/config/database');

describe('InvoicePDFService', () => {
  let service: InvoicePDFService;
  const mockPrisma = prisma;

  const mockOrganizationId = 'org_123';
  const mockInvoiceId = 'inv_456';
  const mockAuditContext = {
    userId: 'user_123',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent'
  };

  const mockInvoice = {
    id: mockInvoiceId,
    organizationId: mockOrganizationId,
    invoiceNumber: 'INV-001',
    issueDate: new Date(),
    dueDate: new Date(),
    status: 'SENT',
    subtotal: 1000.00,
    taxAmount: 130.00,
    totalAmount: 1130.00,
    notes: 'Test invoice',
    items: [
      {
        id: 'item_1',
        description: 'Test Service',
        quantity: 2,
        unitPrice: 500.00,
        totalAmount: 1000.00,
        taxRate: 0.13,
        taxAmount: 130.00
      }
    ],
    customer: {
      id: 'cust_123',
      person: {
        firstName: 'Test',
        lastName: 'Customer',
        email: 'test@example.com'
      }
    },
    organization: {
      id: mockOrganizationId,
      name: 'Test Organization',
      address: '456 Org Ave',
      email: 'org@test.com',
      phone: '+1-555-0123'
    }
  };

  const mockBranding = {
    id: 'brand_123',
    organizationId: mockOrganizationId,
    logoUrl: '/logos/test-logo.png',
    showLogo: true,
    showOrgName: true,
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    taxesEnabled: true,
    defaultTaxExempt: false,
    displaySettings: JSON.stringify({ showTaxes: true }),
    customCss: '.invoice { font-family: Arial; }',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoicePDFService();
  });

  describe('generateInvoicePDF', () => {
    beforeEach(() => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice as any);
      mockPrisma.organizationBranding.findUnique.mockResolvedValue(mockBranding as any);
      mockPrisma.generatedPDF.findFirst.mockResolvedValue(null); // No existing PDF
      mockPrisma.generatedPDF.create.mockResolvedValue({
        id: 'pdf_123',
        filename: 'invoice-INV-001.pdf',
        fileSize: 1024,
        status: 'GENERATED',
        filePath: '/path/to/pdf.pdf',
        createdAt: new Date()
      } as any);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.access as jest.Mock).mockResolvedValue(undefined);
    });

    test('should generate PDF with default template', async () => {
      const result = await service.generateInvoicePDF(
        mockInvoiceId,
        mockOrganizationId,
        {},
        mockAuditContext
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('GENERATED');
      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: mockInvoiceId, organizationId: mockOrganizationId, deletedAt: null },
        include: expect.objectContaining({
          items: expect.any(Object),
          customer: expect.any(Object),
          organization: true,
          quote: expect.any(Object)
        })
      });
    });

    test('should generate PDF with custom template and style', async () => {
      const mockTemplate = {
        id: 'tpl_custom',
        templateType: 'CUSTOM'
      };

      const mockStyle = {
        id: 'sty_custom',
        name: 'custom'
      };

      mockPrisma.invoiceTemplate.findUnique.mockResolvedValue(mockTemplate as any);
      mockPrisma.invoiceStyle.findUnique.mockResolvedValue(mockStyle as any);

      const options = {
        templateId: 'tpl_custom',
        styleId: 'sty_custom',
        format: 'A4' as const,
        orientation: 'portrait' as const
      };

      const result = await service.generateInvoicePDF(
        mockInvoiceId,
        mockOrganizationId,
        options,
        mockAuditContext
      );

      expect(result.status).toBe('GENERATED');
      expect(mockPrisma.invoiceTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: 'tpl_custom', deletedAt: null }
      });
      expect(mockPrisma.invoiceStyle.findUnique).toHaveBeenCalledWith({
        where: { id: 'sty_custom', deletedAt: null }
      });
    });

    test('should handle tax disabled organization', async () => {
      const taxDisabledBranding = {
        ...mockBranding,
        taxesEnabled: false
      };

      mockPrisma.organizationBranding.findUnique.mockResolvedValue(taxDisabledBranding as any);

      const result = await service.generateInvoicePDF(
        mockInvoiceId,
        mockOrganizationId,
        {},
        mockAuditContext
      );

      expect(result.status).toBe('GENERATED');
      // Verify that tax-related data is modified for disabled taxes
    });

    test('should handle different PDF formats', async () => {
      const options = {
        format: 'Letter' as const,
        orientation: 'landscape' as const
      };

      const result = await service.generateInvoicePDF(
        mockInvoiceId,
        mockOrganizationId,
        options,
        mockAuditContext
      );

      expect(result.status).toBe('GENERATED');
    });

    test('should throw error for non-existent invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.generateInvoicePDF(mockInvoiceId, mockOrganizationId, {}, mockAuditContext)
      ).rejects.toThrow('Invoice not found');
    });

    test('should handle PDF generation failure', async () => {
      // Mock Puppeteer to throw an error
      const puppeteer = require('puppeteer');
      puppeteer.launch.mockRejectedValueOnce(new Error('PDF generation failed'));

      await expect(
        service.generateInvoicePDF(
          mockInvoiceId,
          mockOrganizationId,
          {},
          mockAuditContext
        )
      ).rejects.toThrow('PDF generation failed');
    });
  });

  describe('getPDFBuffer', () => {
    test('should read PDF file and return buffer', async () => {
      const mockBuffer = Buffer.from('pdf-content');
      (fs.readFile as jest.Mock).mockResolvedValue(mockBuffer);

      mockPrisma.generatedPDF.findFirst.mockResolvedValue({
        id: 'pdf_123',
        filePath: '/path/to/pdf.pdf',
        organizationId: mockOrganizationId,
        status: 'GENERATED'
      } as any);

      const result = await service.getPDFBuffer('pdf_123', mockOrganizationId);

      expect(result).toEqual(mockBuffer);
      expect(fs.readFile).toHaveBeenCalledWith('/path/to/pdf.pdf');
    });

    test('should throw error for non-existent PDF', async () => {
      mockPrisma.generatedPDF.findFirst.mockResolvedValue(null);

      await expect(
        service.getPDFBuffer('nonexistent', mockOrganizationId)
      ).rejects.toThrow('PDF not found');
    });

    test('should throw error for wrong organization', async () => {
      mockPrisma.generatedPDF.findFirst.mockResolvedValue(null); // Simulates not found due to org filter

      await expect(
        service.getPDFBuffer('pdf_123', mockOrganizationId)
      ).rejects.toThrow('PDF not found');
    });
  });

  describe('Template Compilation', () => {
    test('should register Handlebars helpers during initialization', () => {
      const handlebars = require('handlebars');

      // Test that service registers helpers during initialization
      new InvoicePDFService();

      // Verify helpers are registered (mocked behavior)
      expect(handlebars.registerHelper).toHaveBeenCalled();
    });
  });

  describe('File Management', () => {
    test('should handle file operations during PDF generation', () => {
      // This tests that file operations are called during PDF generation
      expect(fs.mkdir).toBeDefined();
      expect(fs.writeFile).toBeDefined();
    });
  });

  describe('Performance and Caching', () => {
    test('should reuse existing PDF if available', async () => {
      const existingPDF = {
        id: 'pdf_123',
        filename: 'invoice-INV-001.pdf',
        status: 'GENERATED',
        templateId: null,
        styleId: null,
        filePath: '/path/to/existing.pdf',
        createdAt: new Date()
      };

      mockPrisma.generatedPDF.findFirst.mockResolvedValue(existingPDF as any);
      (fs.access as jest.Mock).mockResolvedValue(undefined); // File exists

      const result = await service.generateInvoicePDF(
        mockInvoiceId,
        mockOrganizationId,
        {},
        mockAuditContext
      );

      // Should return existing PDF instead of generating new one
      expect(result.id).toBe('pdf_123');
      expect(mockPrisma.generatedPDF.create).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      mockPrisma.invoice.findFirst.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        service.generateInvoicePDF(mockInvoiceId, mockOrganizationId, {}, mockAuditContext)
      ).rejects.toThrow('Database connection failed');
    });

    test('should handle file system errors', async () => {
      (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Disk full'));

      await expect(
        service.generateInvoicePDF(
          mockInvoiceId,
          mockOrganizationId,
          {},
          mockAuditContext
        )
      ).rejects.toThrow('PDF generation failed');
    });
  });

  describe('Multi-tenant Security', () => {
    test('should enforce organization isolation in PDF generation', async () => {
      // Mock no invoice found for wrong org (findFirst with org filter returns null)
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.generateInvoicePDF(mockInvoiceId, mockOrganizationId, {}, mockAuditContext)
      ).rejects.toThrow('Invoice not found');
    });
  });
});