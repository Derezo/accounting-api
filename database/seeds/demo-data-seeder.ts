/**
 * Demo Data Seeder - Creates comprehensive demo data showcasing the full system
 */

import { BaseSeeder, SeedOptions, SeedResult } from './base-seeder';
import bcrypt from 'bcryptjs';

export class DemoDataSeeder extends BaseSeeder {
  get name(): string {
    return 'DemoDataSeeder';
  }

  async seed(options: SeedOptions): Promise<SeedResult> {
    if (options.environment === 'production') {
      throw new Error('Demo data seeding is not allowed in production');
    }

    if (!options.organizationId) {
      throw new Error('Organization ID is required for demo data seeding');
    }

    let recordsCreated = 0;

    // Seed in logical order
    recordsCreated += await this.seedUsers(options.organizationId);
    recordsCreated += await this.seedCustomers(options.organizationId);
    recordsCreated += await this.seedVendors(options.organizationId);
    recordsCreated += await this.seedProductsAndServices(options.organizationId);
    recordsCreated += await this.seedQuotes(options.organizationId);
    recordsCreated += await this.seedInvoices(options.organizationId);
    recordsCreated += await this.seedPayments(options.organizationId);
    recordsCreated += await this.seedProjects(options.organizationId);
    recordsCreated += await this.seedAppointments(options.organizationId);
    recordsCreated += await this.seedExpenses(options.organizationId);

    return {
      seederName: this.name,
      environment: options.environment,
      recordsCreated,
      timeTaken: 0,
      success: true,
      errors: [],
    };
  }

  async clean(options: SeedOptions): Promise<void> {
    if (!options.organizationId) {
      throw new Error('Organization ID is required for cleaning');
    }

    this.logger.info(`Cleaning demo data for organization: ${options.organizationId}`);

    // Clean in reverse dependency order
    await this.prisma.appointment.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.expense.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.payment.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.invoiceItem.deleteMany({
      where: { invoice: { organizationId: options.organizationId } },
    });
    await this.prisma.invoice.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.quoteItem.deleteMany({
      where: { quote: { organizationId: options.organizationId } },
    });
    await this.prisma.quote.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.project.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.product.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.service.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.vendor.deleteMany({
      where: { organizationId: options.organizationId },
    });
    await this.prisma.customer.deleteMany({
      where: { organizationId: options.organizationId },
    });

    this.logger.info('Demo data cleaned');
  }

  private async seedUsers(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo users...');

    const users = [
      {
        email: 'manager@lifestreamdynamics.com',
        firstName: 'John',
        lastName: 'Manager',
        role: 'MANAGER',
        password: 'Manager123!',
      },
      {
        email: 'accountant@lifestreamdynamics.com',
        firstName: 'Alice',
        lastName: 'Accountant',
        role: 'ACCOUNTANT',
        password: 'Accountant123!',
      },
      {
        email: 'employee@lifestreamdynamics.com',
        firstName: 'Bob',
        lastName: 'Employee',
        role: 'EMPLOYEE',
        password: 'Employee123!',
      },
      {
        email: 'viewer@lifestreamdynamics.com',
        firstName: 'Carol',
        lastName: 'Viewer',
        role: 'VIEWER',
        password: 'Viewer123!',
      },
    ];

    let created = 0;
    for (const userData of users) {
      const passwordHash = await bcrypt.hash(userData.password, 12);

      await this.prisma.user.create({
        data: {
          organizationId,
          email: userData.email,
          passwordHash,
          role: userData.role,
          firstName: userData.firstName,
          lastName: userData.lastName,
          isActive: true,
          emailVerified: true,
          phone: this.generateCanadianPhone(),
        },
      });
      created++;
    }

    this.logger.info(`Created ${created} demo users`);
    return created;
  }

  private async seedCustomers(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo customers...');

    const customers = [
      {
        type: 'person',
        firstName: 'Emma',
        lastName: 'Thompson',
        email: 'emma.thompson@email.com',
        phone: this.generateCanadianPhone(),
        tier: 'PREMIUM',
        status: 'ACTIVE',
      },
      {
        type: 'person',
        firstName: 'James',
        lastName: 'Wilson',
        email: 'james.wilson@email.com',
        phone: this.generateCanadianPhone(),
        tier: 'PERSONAL',
        status: 'ACTIVE',
      },
      {
        type: 'business',
        legalName: 'Innovative Tech Solutions Inc.',
        tradeName: 'InnoTech',
        email: 'contact@innotech.ca',
        phone: this.generateCanadianPhone(),
        businessNumber: this.generateCanadianBusinessNumber(),
        tier: 'ENTERPRISE',
        status: 'ACTIVE',
      },
      {
        type: 'business',
        legalName: 'Global Marketing Corp.',
        tradeName: 'GlobalMark',
        email: 'info@globalmark.ca',
        phone: this.generateCanadianPhone(),
        businessNumber: this.generateCanadianBusinessNumber(),
        tier: 'BUSINESS',
        status: 'ACTIVE',
      },
      {
        type: 'person',
        firstName: 'Sarah',
        lastName: 'Davis',
        email: 'sarah.davis@email.com',
        phone: this.generateCanadianPhone(),
        tier: 'PERSONAL',
        status: 'PROSPECT',
      },
    ];

    const canadaCountry = await this.prisma.country.findUnique({
      where: { code: 'CA' },
    });

    if (!canadaCountry) {
      throw new Error('Canada country record not found');
    }

    let created = 0;
    for (const customerData of customers) {
      await this.prisma.$transaction(async (tx) => {
        let personId: string | undefined;
        let businessId: string | undefined;

        if (customerData.type === 'person') {
          // Create person
          const person = await tx.person.create({
            data: {
              organizationId,
              firstName: customerData.firstName!,
              lastName: customerData.lastName!,
              email: customerData.email,
              phone: customerData.phone,
            },
          });
          personId = person.id;
        } else {
          // Create business
          const business = await tx.business.create({
            data: {
              organizationId,
              legalName: customerData.legalName!,
              tradeName: customerData.tradeName,
              businessNumber: customerData.businessNumber,
              businessType: 'CORPORATION',
              email: customerData.email,
              phone: customerData.phone,
            },
          });
          businessId = business.id;
        }

        // Create customer
        const customerNumber = `CUST-${(created + 1).toString().padStart(4, '0')}`;
        const customer = await tx.customer.create({
          data: {
            organizationId,
            customerNumber,
            personId,
            businessId,
            tier: customerData.tier,
            status: customerData.status,
            creditLimit: customerData.tier === 'ENTERPRISE' ? 50000 : customerData.tier === 'BUSINESS' ? 25000 : 5000,
            paymentTerms: customerData.tier === 'ENTERPRISE' ? 30 : 15,
            preferredCurrency: 'CAD',
          },
        });

        // Create address
        const addressData = this.generateCanadianAddress();
        const address = await tx.address.create({
          data: {
            organizationId,
            line1: addressData.line1,
            line2: addressData.line2,
            city: addressData.city,
            stateProvince: addressData.stateProvince,
            postalCode: addressData.postalCode,
            countryId: canadaCountry.id,
          },
        });

        // Link customer to address
        await tx.customerAddress.create({
          data: {
            customerId: customer.id,
            addressId: address.id,
            addressType: 'BILLING',
            isPrimary: true,
          },
        });
      });

      created++;
      this.logProgress('Creating customers', created, customers.length);
    }

    this.logger.info(`Created ${created} demo customers`);
    return created;
  }

  private async seedVendors(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo vendors...');

    const vendors = [
      {
        legalName: 'Office Supplies Plus Ltd.',
        tradeName: 'Office Plus',
        email: 'orders@officeplus.ca',
        phone: this.generateCanadianPhone(),
        businessNumber: this.generateCanadianBusinessNumber(),
        category: 'Office Supplies',
      },
      {
        legalName: 'Tech Hardware Distributors Inc.',
        tradeName: 'TechDist',
        email: 'sales@techdist.ca',
        phone: this.generateCanadianPhone(),
        businessNumber: this.generateCanadianBusinessNumber(),
        category: 'Technology',
      },
      {
        legalName: 'Professional Services Group Corp.',
        tradeName: 'ProServ Group',
        email: 'contact@proservgroup.ca',
        phone: this.generateCanadianPhone(),
        businessNumber: this.generateCanadianBusinessNumber(),
        category: 'Professional Services',
      },
    ];

    const canadaCountry = await this.prisma.country.findUnique({
      where: { code: 'CA' },
    });

    if (!canadaCountry) {
      throw new Error('Canada country record not found');
    }

    let created = 0;
    for (const vendorData of vendors) {
      await this.prisma.$transaction(async (tx) => {
        // Create business
        const business = await tx.business.create({
          data: {
            organizationId,
            legalName: vendorData.legalName,
            tradeName: vendorData.tradeName,
            businessNumber: vendorData.businessNumber,
            businessType: 'CORPORATION',
            email: vendorData.email,
            phone: vendorData.phone,
          },
        });

        // Create vendor
        const vendorNumber = `VEND-${(created + 1).toString().padStart(4, '0')}`;
        const vendor = await tx.vendor.create({
          data: {
            organizationId,
            vendorNumber,
            businessId: business.id,
            category: vendorData.category,
            paymentTerms: 30,
            preferredPaymentMethod: 'BANK_TRANSFER',
            isActive: true,
          },
        });

        // Create address
        const addressData = this.generateCanadianAddress();
        const address = await tx.address.create({
          data: {
            organizationId,
            line1: addressData.line1,
            line2: addressData.line2,
            city: addressData.city,
            stateProvince: addressData.stateProvince,
            postalCode: addressData.postalCode,
            countryId: canadaCountry.id,
          },
        });

        // Link vendor to address
        await tx.vendorAddress.create({
          data: {
            vendorId: vendor.id,
            addressId: address.id,
            addressType: 'BILLING',
            isPrimary: true,
          },
        });
      });

      created++;
    }

    this.logger.info(`Created ${created} demo vendors`);
    return created;
  }

  private async seedProductsAndServices(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo products and services...');

    // Get categories
    const softwareCategory = await this.prisma.productCategory.findFirst({
      where: { code: 'SOFTWARE' },
    });
    const hardwareCategory = await this.prisma.productCategory.findFirst({
      where: { code: 'HARDWARE' },
    });
    const webDevCategory = await this.prisma.serviceCategory.findFirst({
      where: { code: 'WEB_DEV' },
    });
    const consultingCategory = await this.prisma.serviceCategory.findFirst({
      where: { code: 'TECH_CONSULTING' },
    });

    if (!softwareCategory || !hardwareCategory || !webDevCategory || !consultingCategory) {
      throw new Error('Required categories not found');
    }

    // Create products
    const products = [
      {
        sku: 'SW-001',
        name: 'Professional Software License',
        description: 'Annual license for professional software suite',
        categoryId: softwareCategory.id,
        unitPrice: 299.99,
        cost: 150.00,
      },
      {
        sku: 'HW-001',
        name: 'Wireless Mouse',
        description: 'Ergonomic wireless optical mouse',
        categoryId: hardwareCategory.id,
        unitPrice: 45.99,
        cost: 25.00,
        trackInventory: true,
        quantity: 50,
        reorderPoint: 10,
      },
      {
        sku: 'HW-002',
        name: 'USB-C Hub',
        description: '7-in-1 USB-C multiport adapter',
        categoryId: hardwareCategory.id,
        unitPrice: 89.99,
        cost: 45.00,
        trackInventory: true,
        quantity: 25,
        reorderPoint: 5,
      },
    ];

    let created = 0;
    for (const productData of products) {
      await this.prisma.product.create({
        data: {
          organizationId,
          ...productData,
          taxable: true,
          isActive: true,
        },
      });
      created++;
    }

    // Create services
    const services = [
      {
        code: 'WEB-DEV-001',
        name: 'Web Development',
        description: 'Custom website development services',
        categoryId: webDevCategory.id,
        hourlyRate: 125.00,
        minimumHours: 1.0,
      },
      {
        code: 'CONS-001',
        name: 'Technical Consulting',
        description: 'Technical architecture and consulting services',
        categoryId: consultingCategory.id,
        hourlyRate: 175.00,
        minimumHours: 2.0,
      },
      {
        code: 'WEB-DEV-002',
        name: 'Website Maintenance',
        description: 'Ongoing website maintenance and support',
        categoryId: webDevCategory.id,
        hourlyRate: 95.00,
        minimumHours: 0.5,
      },
    ];

    for (const serviceData of services) {
      await this.prisma.service.create({
        data: {
          organizationId,
          ...serviceData,
          taxable: true,
          isActive: true,
        },
      });
      created++;
    }

    this.logger.info(`Created ${created} demo products and services`);
    return created;
  }

  private async seedQuotes(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo quotes...');

    const customers = await this.prisma.customer.findMany({
      where: { organizationId },
      take: 3,
    });

    const users = await this.prisma.user.findMany({
      where: { organizationId },
      take: 1,
    });

    const services = await this.prisma.service.findMany({
      where: { organizationId },
    });

    if (customers.length === 0 || users.length === 0 || services.length === 0) {
      this.logger.warn('Not enough data to create quotes');
      return 0;
    }

    let created = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const user = users[0];

      await this.prisma.$transaction(async (tx) => {
        const quoteNumber = `QUO-${new Date().getFullYear()}-${(created + 1).toString().padStart(4, '0')}`;

        const quote = await tx.quote.create({
          data: {
            organizationId,
            quoteNumber,
            customerId: customer.id,
            createdById: user.id,
            status: i === 0 ? 'ACCEPTED' : i === 1 ? 'SENT' : 'DRAFT',
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            currency: 'CAD',
            subtotal: 0, // Will be calculated
            taxAmount: 0, // Will be calculated
            total: 0, // Will be calculated
            description: 'Custom software development project',
            terms: 'Payment due within 15 days of acceptance',
            sentAt: i > 0 ? new Date() : null,
            acceptedAt: i === 0 ? new Date() : null,
          },
        });

        // Add quote items
        let subtotal = 0;
        const selectedServices = services.slice(0, 2); // Take first 2 services

        for (let j = 0; j < selectedServices.length; j++) {
          const service = selectedServices[j];
          const quantity = 10 + Math.random() * 20; // 10-30 hours
          const unitPrice = service.hourlyRate;
          const itemSubtotal = quantity * unitPrice;
          const taxRate = 0.13; // HST
          const taxAmount = itemSubtotal * taxRate;
          const itemTotal = itemSubtotal + taxAmount;

          await tx.quoteItem.create({
            data: {
              quoteId: quote.id,
              serviceId: service.id,
              description: service.description || service.name,
              quantity,
              unitPrice,
              discountPercent: 0,
              taxRate,
              subtotal: itemSubtotal,
              discountAmount: 0,
              taxAmount,
              total: itemTotal,
              sortOrder: j + 1,
            },
          });

          subtotal += itemSubtotal;
        }

        const taxAmount = subtotal * 0.13;
        const total = subtotal + taxAmount;

        // Update quote with calculated totals
        await tx.quote.update({
          where: { id: quote.id },
          data: {
            subtotal,
            taxAmount,
            total,
          },
        });
      });

      created++;
      this.logProgress('Creating quotes', created, customers.length);
    }

    this.logger.info(`Created ${created} demo quotes`);
    return created;
  }

  private async seedInvoices(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo invoices...');

    const acceptedQuotes = await this.prisma.quote.findMany({
      where: {
        organizationId,
        status: 'ACCEPTED',
      },
      include: {
        items: {
          include: {
            service: true,
            product: true,
          },
        },
        customer: true,
      },
    });

    const customers = await this.prisma.customer.findMany({
      where: { organizationId },
    });

    let created = 0;

    // Create invoices from accepted quotes
    for (const quote of acceptedQuotes) {
      await this.prisma.$transaction(async (tx) => {
        const invoiceNumber = `INV-${new Date().getFullYear()}-${(created + 1).toString().padStart(4, '0')}`;

        const invoice = await tx.invoice.create({
          data: {
            organizationId,
            invoiceNumber,
            customerId: quote.customerId,
            quoteId: quote.id,
            status: 'SENT',
            issueDate: new Date(),
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
            currency: quote.currency,
            subtotal: quote.subtotal,
            taxAmount: quote.taxAmount,
            total: quote.total,
            depositRequired: quote.total * 0.25, // 25% deposit
            amountPaid: 0,
            balance: quote.total,
            terms: 'Payment due within 15 days',
            sentAt: new Date(),
          },
        });

        // Copy quote items to invoice items
        for (const quoteItem of quote.items) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              productId: quoteItem.productId,
              serviceId: quoteItem.serviceId,
              description: quoteItem.description,
              quantity: quoteItem.quantity,
              unitPrice: quoteItem.unitPrice,
              discountPercent: quoteItem.discountPercent,
              taxRate: quoteItem.taxRate,
              subtotal: quoteItem.subtotal,
              discountAmount: quoteItem.discountAmount,
              taxAmount: quoteItem.taxAmount,
              total: quoteItem.total,
              sortOrder: quoteItem.sortOrder,
            },
          });
        }
      });

      created++;
    }

    // Create additional standalone invoices
    const additionalCustomers = customers.slice(acceptedQuotes.length);
    for (let i = 0; i < Math.min(2, additionalCustomers.length); i++) {
      const customer = additionalCustomers[i];
      const services = await this.prisma.service.findMany({
        where: { organizationId },
        take: 1,
      });

      if (services.length > 0) {
        await this.prisma.$transaction(async (tx) => {
          const invoiceNumber = `INV-${new Date().getFullYear()}-${(created + 1).toString().padStart(4, '0')}`;
          const service = services[0];
          const quantity = 5 + Math.random() * 10; // 5-15 hours
          const subtotal = quantity * service.hourlyRate;
          const taxAmount = subtotal * 0.13;
          const total = subtotal + taxAmount;

          const invoice = await tx.invoice.create({
            data: {
              organizationId,
              invoiceNumber,
              customerId: customer.id,
              status: i === 0 ? 'PAID' : 'OVERDUE',
              issueDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
              dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
              currency: 'CAD',
              subtotal,
              taxAmount,
              total,
              depositRequired: 0,
              amountPaid: i === 0 ? total : 0,
              balance: i === 0 ? 0 : total,
              terms: 'Payment due within 15 days',
              sentAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
              paidAt: i === 0 ? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) : null,
            },
          });

          await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              serviceId: service.id,
              description: service.description || service.name,
              quantity,
              unitPrice: service.hourlyRate,
              discountPercent: 0,
              taxRate: 0.13,
              subtotal,
              discountAmount: 0,
              taxAmount,
              total,
              sortOrder: 1,
            },
          });
        });

        created++;
      }
    }

    this.logger.info(`Created ${created} demo invoices`);
    return created;
  }

  private async seedPayments(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo payments...');

    const paidInvoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: 'PAID',
      },
    });

    let created = 0;
    for (const invoice of paidInvoices) {
      const paymentNumber = `PAY-${new Date().getFullYear()}-${(created + 1).toString().padStart(4, '0')}`;

      await this.prisma.payment.create({
        data: {
          organizationId,
          paymentNumber,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          paymentMethod: 'E_TRANSFER',
          amount: invoice.total,
          currency: invoice.currency,
          paymentDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
          referenceNumber: `ET${Math.floor(Math.random() * 1000000)}`,
          status: 'COMPLETED',
          processorFee: 2.50,
          netAmount: invoice.total - 2.50,
          customerNotes: 'Payment for services rendered',
          processedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });

      created++;
    }

    this.logger.info(`Created ${created} demo payments`);
    return created;
  }

  private async seedProjects(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo projects...');

    const customers = await this.prisma.customer.findMany({
      where: { organizationId },
      take: 3,
    });

    const users = await this.prisma.user.findMany({
      where: { organizationId },
      take: 1,
    });

    if (customers.length === 0 || users.length === 0) {
      this.logger.warn('Not enough data to create projects');
      return 0;
    }

    const projectStatuses = ['QUOTED', 'IN_PROGRESS', 'COMPLETED'];
    let created = 0;

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const user = users[0];
      const status = projectStatuses[i % projectStatuses.length];

      const projectNumber = `PROJ-${new Date().getFullYear()}-${(created + 1).toString().padStart(4, '0')}`;

      const startDate = status !== 'QUOTED' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : null;
      const endDate = status === 'COMPLETED' ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) :
                      status === 'IN_PROGRESS' ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) : null;

      await this.prisma.project.create({
        data: {
          organizationId,
          projectNumber,
          customerId: customer.id,
          assignedToId: user.id,
          name: this.generateProjectDescription(),
          description: 'Comprehensive software development project with modern technologies',
          status,
          priority: Math.floor(Math.random() * 4) + 1, // 1-4
          startDate,
          endDate,
          actualStartDate: status !== 'QUOTED' ? startDate : null,
          actualEndDate: status === 'COMPLETED' ? endDate : null,
          estimatedHours: 40 + Math.random() * 80, // 40-120 hours
          actualHours: status === 'COMPLETED' ? 45 + Math.random() * 70 : null,
          hourlyRate: 125.00,
          completedAt: status === 'COMPLETED' ? endDate : null,
        },
      });

      created++;
    }

    this.logger.info(`Created ${created} demo projects`);
    return created;
  }

  private async seedAppointments(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo appointments...');

    const customers = await this.prisma.customer.findMany({
      where: { organizationId },
      take: 5,
    });

    const projects = await this.prisma.project.findMany({
      where: { organizationId },
    });

    const locations = await this.prisma.location.findMany({
      where: { organizationId },
    });

    if (customers.length === 0 || locations.length === 0) {
      this.logger.warn('Not enough data to create appointments');
      return 0;
    }

    let created = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const project = projects[i % projects.length] || null;
      const location = locations[0];

      // Create appointments for different time periods
      const appointmentTimes = [
        new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago (completed)
      ];

      for (let j = 0; j < appointmentTimes.length; j++) {
        const startTime = appointmentTimes[j];
        startTime.setHours(9 + j * 2, 0, 0, 0); // 9 AM, 11 AM, 1 PM

        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

        await this.prisma.appointment.create({
          data: {
            organizationId,
            customerId: customer.id,
            projectId: project?.id,
            locationId: location.id,
            title: `Project Discussion - ${customer.customerNumber}`,
            description: 'Project planning and requirements discussion',
            startTime,
            endTime,
            duration: 60, // minutes
            confirmed: true,
            completed: j === 2, // Last appointment is completed
            cancelled: false,
            reminderSent: j < 2, // Future appointments have reminders sent
            reminderSentAt: j < 2 ? new Date(startTime.getTime() - 24 * 60 * 60 * 1000) : null,
          },
        });

        created++;
      }
    }

    this.logger.info(`Created ${created} demo appointments`);
    return created;
  }

  private async seedExpenses(organizationId: string): Promise<number> {
    this.logger.info('Seeding demo expenses...');

    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId },
    });

    if (vendors.length === 0) {
      this.logger.warn('No vendors found to create expenses');
      return 0;
    }

    const expenseCategories = [
      'Office Supplies',
      'Software',
      'Hardware',
      'Professional Services',
      'Travel',
      'Utilities',
    ];

    let created = 0;
    for (let i = 0; i < 10; i++) {
      const vendor = vendors[i % vendors.length];
      const category = expenseCategories[i % expenseCategories.length];
      const amount = 50 + Math.random() * 500; // $50-$550
      const taxAmount = amount * 0.13; // HST

      const expenseNumber = `EXP-${new Date().getFullYear()}-${(created + 1).toString().padStart(4, '0')}`;

      await this.prisma.expense.create({
        data: {
          organizationId,
          expenseNumber,
          vendorId: vendor.id,
          category,
          amount,
          taxAmount,
          currency: 'CAD',
          expenseDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Within last 30 days
          paymentMethod: 'CREDIT_CARD',
          paymentStatus: i % 3 === 0 ? 'PAID' : 'PENDING',
          paidAt: i % 3 === 0 ? new Date() : null,
          description: `${category} expense from ${vendor.vendorNumber}`,
          notes: 'Business expense for operations',
        },
      });

      created++;
    }

    this.logger.info(`Created ${created} demo expenses`);
    return created;
  }
}

export default DemoDataSeeder;