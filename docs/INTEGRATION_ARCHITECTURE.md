# Universal Accounting API - Integration Architecture

## Overview

The Universal Accounting API is designed with a comprehensive integration architecture that supports seamless connectivity with external systems, third-party services, and business tools. This architecture enables businesses of all sizes to maintain their existing workflows while leveraging the power of a universal accounting platform.

## Integration Design Principles

### API-First Architecture
- **RESTful APIs**: Well-defined, stateless API endpoints
- **OpenAPI 3.0 Specification**: Complete API documentation and schema
- **Webhook Support**: Real-time event notifications
- **Rate Limiting**: Fair usage policies with graduated limits
- **Versioning**: Backward-compatible API versioning strategy

### Event-Driven Integration
- **Asynchronous Processing**: Non-blocking integration patterns
- **Event Sourcing**: Complete audit trail of business events
- **Message Queues**: Reliable message delivery with retry mechanisms
- **Webhook Delivery**: Guaranteed delivery with exponential backoff

### Universal Business System Support
- **Accounting Software**: QuickBooks, Xero, Sage, FreshBooks
- **Payment Gateways**: Stripe, PayPal, Square, Moneris
- **Banking Systems**: Open Banking APIs, bank file imports
- **E-commerce Platforms**: Shopify, WooCommerce, Magento
- **CRM Systems**: Salesforce, HubSpot, Pipedrive
- **Project Management**: Asana, Monday.com, Jira

## Event-Driven Architecture

### Core Event System
```typescript
interface DomainEvent {
  id: string;
  type: EventType;
  aggregateId: string;
  aggregateType: 'Customer' | 'Invoice' | 'Payment' | 'Project' | 'Quote';
  organizationId: string;
  data: Record<string, any>;
  metadata: EventMetadata;
  version: number;
  timestamp: Date;
}

interface EventMetadata {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  source: 'API' | 'WEBHOOK' | 'SYSTEM' | 'IMPORT';
  correlationId?: string;
  causationId?: string; // ID of the event that caused this event
}

enum EventType {
  // Customer Lifecycle Events
  CUSTOMER_CREATED = 'customer.created',
  CUSTOMER_UPDATED = 'customer.updated',
  CUSTOMER_DEACTIVATED = 'customer.deactivated',

  // Sales Process Events
  QUOTE_CREATED = 'quote.created',
  QUOTE_SENT = 'quote.sent',
  QUOTE_VIEWED = 'quote.viewed',
  QUOTE_ACCEPTED = 'quote.accepted',
  QUOTE_REJECTED = 'quote.rejected',
  QUOTE_EXPIRED = 'quote.expired',

  // Project Management Events
  PROJECT_CREATED = 'project.created',
  PROJECT_STARTED = 'project.started',
  PROJECT_PAUSED = 'project.paused',
  PROJECT_COMPLETED = 'project.completed',
  PROJECT_CANCELLED = 'project.cancelled',
  MILESTONE_COMPLETED = 'milestone.completed',

  // Billing & Invoicing Events
  INVOICE_CREATED = 'invoice.created',
  INVOICE_SENT = 'invoice.sent',
  INVOICE_VIEWED = 'invoice.viewed',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_PARTIALLY_PAID = 'invoice.partially_paid',
  INVOICE_OVERDUE = 'invoice.overdue',
  INVOICE_CANCELLED = 'invoice.cancelled',

  // Payment Processing Events
  PAYMENT_INITIATED = 'payment.initiated',
  PAYMENT_PROCESSING = 'payment.processing',
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',
  PAYMENT_DISPUTED = 'payment.disputed',

  // Financial Events
  JOURNAL_ENTRY_CREATED = 'journal_entry.created',
  ACCOUNT_BALANCE_CHANGED = 'account.balance_changed',
  REVENUE_RECOGNIZED = 'revenue.recognized',
  EXPENSE_RECORDED = 'expense.recorded',

  // Vendor & Purchase Events
  VENDOR_CREATED = 'vendor.created',
  PURCHASE_ORDER_CREATED = 'purchase_order.created',
  BILL_RECEIVED = 'bill.received',
  BILL_PAID = 'bill.paid',

  // Inventory Events
  INVENTORY_ADJUSTED = 'inventory.adjusted',
  STOCK_LOW = 'inventory.stock_low',
  PRODUCT_CREATED = 'product.created',

  // Employee & Time Tracking Events
  TIME_ENTRY_CREATED = 'time_entry.created',
  TIMESHEET_SUBMITTED = 'timesheet.submitted',
  PAYROLL_PROCESSED = 'payroll.processed',

  // System Events
  DATA_IMPORTED = 'system.data_imported',
  DATA_EXPORTED = 'system.data_exported',
  BACKUP_COMPLETED = 'system.backup_completed',
  SYNC_COMPLETED = 'system.sync_completed',
}

class EventBus {
  private publishers: Map<string, EventPublisher[]> = new Map();
  private messageQueue: Queue;
  private eventStore: EventStore;

  async publish(event: DomainEvent): Promise<void> {
    // Store event for audit and replay
    await this.eventStore.append(event);

    // Publish to internal handlers
    const publishers = this.publishers.get(event.type) || [];
    for (const publisher of publishers) {
      await publisher.handle(event);
    }

    // Queue for webhook delivery
    await this.messageQueue.add('webhook-delivery', {
      eventType: event.type,
      payload: event,
      organizationId: event.organizationId,
    });

    // Queue for external integrations
    await this.messageQueue.add('integration-sync', {
      event,
      organizationId: event.organizationId,
    });
  }

  subscribe(eventType: EventType, publisher: EventPublisher): void {
    const publishers = this.publishers.get(eventType) || [];
    publishers.push(publisher);
    this.publishers.set(eventType, publishers);
  }
}
```

### Event Handlers & Processors
```typescript
interface EventHandler<T extends DomainEvent = DomainEvent> {
  eventType: EventType;
  handle(event: T): Promise<void>;
}

// Email notification handler
class EmailNotificationHandler implements EventHandler {
  eventType = EventType.INVOICE_SENT;

  async handle(event: DomainEvent): Promise<void> {
    const invoice = await this.getInvoice(event.aggregateId);
    const customer = await this.getCustomer(invoice.customerId);

    await this.emailService.sendInvoiceEmail({
      to: customer.email,
      customerName: customer.name,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      downloadUrl: await this.generateInvoicePDF(invoice.id),
    });

    // Track email sent event
    await this.eventBus.publish({
      id: generateId(),
      type: EventType.EMAIL_SENT,
      aggregateId: invoice.id,
      aggregateType: 'Invoice',
      organizationId: event.organizationId,
      data: {
        emailType: 'INVOICE',
        recipient: customer.email,
        templateUsed: 'invoice-sent',
      },
      metadata: {
        source: 'SYSTEM',
        correlationId: event.id,
      },
      version: 1,
      timestamp: new Date(),
    });
  }
}

// Financial sync handler
class FinancialSyncHandler implements EventHandler {
  eventType = EventType.PAYMENT_SUCCEEDED;

  async handle(event: DomainEvent): Promise<void> {
    const payment = await this.getPayment(event.aggregateId);

    // Update account balances
    await this.accountingService.recordPayment(payment);

    // Sync with external accounting systems
    const integrations = await this.getActiveIntegrations(event.organizationId);

    for (const integration of integrations) {
      await this.syncWithIntegration(integration, payment);
    }
  }

  private async syncWithIntegration(
    integration: Integration,
    payment: Payment
  ): Promise<void> {
    switch (integration.provider) {
      case 'QUICKBOOKS':
        await this.quickbooksSync.syncPayment(payment, integration.credentials);
        break;
      case 'XERO':
        await this.xeroSync.syncPayment(payment, integration.credentials);
        break;
      case 'STRIPE':
        // Stripe is the source, no sync needed
        break;
    }
  }
}

// Project management integration handler
class ProjectManagementHandler implements EventHandler {
  eventType = EventType.PROJECT_CREATED;

  async handle(event: DomainEvent): Promise<void> {
    const project = await this.getProject(event.aggregateId);
    const integrations = await this.getProjectManagementIntegrations(event.organizationId);

    for (const integration of integrations) {
      await this.createProjectInExternalSystem(project, integration);
    }
  }

  private async createProjectInExternalSystem(
    project: Project,
    integration: Integration
  ): Promise<void> {
    switch (integration.provider) {
      case 'ASANA':
        await this.asanaIntegration.createProject(project, integration.credentials);
        break;
      case 'MONDAY':
        await this.mondayIntegration.createProject(project, integration.credentials);
        break;
      case 'JIRA':
        await this.jiraIntegration.createProject(project, integration.credentials);
        break;
    }
  }
}
```

## Webhook System

### Webhook Management
```typescript
interface WebhookConfig {
  organizationId: string;
  url: string;
  events: EventType[];
  secret: string;
  isActive: boolean;
  retryPolicy: RetryPolicy;
  headers?: Record<string, string>;
  timeout?: number;
}

interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
}

class WebhookManager {
  private defaultRetryPolicy: RetryPolicy = {
    maxRetries: 5,
    backoffMultiplier: 2,
    initialDelay: 1000, // 1 second
    maxDelay: 300000,   // 5 minutes
  };

  async registerWebhook(config: WebhookConfig): Promise<Webhook> {
    // Validate webhook URL
    await this.validateWebhookUrl(config.url);

    // Generate secure secret if not provided
    const secret = config.secret || this.generateSecret();

    const webhook = await prisma.webhook.create({
      data: {
        organizationId: config.organizationId,
        url: config.url,
        events: config.events,
        secret: await this.hashSecret(secret),
        isActive: config.isActive,
        retryPolicy: config.retryPolicy || this.defaultRetryPolicy,
        headers: config.headers || {},
        timeout: config.timeout || 30000,
      },
    });

    return { ...webhook, secret }; // Return plain secret only once
  }

  async deliverWebhook(
    webhook: Webhook,
    event: DomainEvent
  ): Promise<WebhookDelivery> {
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType: event.type,
        payload: event,
        status: 'PENDING',
        attempts: 0,
      },
    });

    try {
      const signature = this.generateSignature(webhook.secret, event);
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature-256': signature,
        'X-Webhook-Event': event.type,
        'X-Webhook-Delivery': delivery.id,
        'X-Webhook-Timestamp': event.timestamp.toISOString(),
        ...webhook.headers,
      };

      const response = await this.httpClient.post(webhook.url, event, {
        headers,
        timeout: webhook.timeout,
      });

      await this.updateDeliveryStatus(delivery.id, {
        status: 'DELIVERED',
        responseCode: response.status,
        responseHeaders: response.headers,
        responseBody: response.data,
        deliveredAt: new Date(),
      });

      return delivery;

    } catch (error) {
      await this.handleDeliveryFailure(delivery, error);
      throw error;
    }
  }

  private async handleDeliveryFailure(
    delivery: WebhookDelivery,
    error: Error
  ): Promise<void> {
    const attempts = delivery.attempts + 1;
    const webhook = await this.getWebhook(delivery.webhookId);

    if (attempts >= webhook.retryPolicy.maxRetries) {
      await this.updateDeliveryStatus(delivery.id, {
        status: 'FAILED',
        attempts,
        failureReason: error.message,
        failedAt: new Date(),
      });

      // Disable webhook after consecutive failures
      await this.checkWebhookHealth(webhook);
      return;
    }

    // Schedule retry
    const delay = Math.min(
      webhook.retryPolicy.initialDelay * Math.pow(webhook.retryPolicy.backoffMultiplier, attempts - 1),
      webhook.retryPolicy.maxDelay
    );

    await this.updateDeliveryStatus(delivery.id, {
      status: 'RETRYING',
      attempts,
      nextRetryAt: new Date(Date.now() + delay),
    });

    // Queue retry job
    await this.messageQueue.add('webhook-retry', {
      deliveryId: delivery.id,
    }, {
      delay,
    });
  }

  private generateSignature(secret: string, payload: any): string {
    const body = JSON.stringify(payload);
    return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  async validateWebhookSignature(
    signature: string,
    body: string,
    secret: string
  ): Promise<boolean> {
    const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
```

## Third-Party Integrations

### Payment Gateway Integrations

#### Stripe Integration
```typescript
class StripeIntegration {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  async createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntent> {
    const customer = await this.getOrCreateStripeCustomer(request.customerId);

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(request.amount * 100), // Convert to cents
      currency: request.currency.toLowerCase(),
      customer: customer.stripeCustomerId,
      payment_method_types: request.paymentMethodTypes,
      setup_future_usage: request.savePaymentMethod ? 'off_session' : undefined,
      metadata: {
        organizationId: request.organizationId,
        customerId: request.customerId,
        invoiceId: request.invoiceId,
        quoteId: request.quoteId,
      },
    });

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    };
  }

  async handleWebhook(signature: string, body: string): Promise<void> {
    const event = this.stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.dispute.created':
        await this.handleDispute(event.data.object as Stripe.Dispute);
        break;
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: { reference: paymentIntent.id },
    });

    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          fees: paymentIntent.charges.data[0]?.balance_transaction?.fee || 0,
          netAmount: (paymentIntent.amount - (paymentIntent.charges.data[0]?.balance_transaction?.fee || 0)) / 100,
        },
      });

      // Publish payment success event
      await this.eventBus.publish({
        id: generateId(),
        type: EventType.PAYMENT_SUCCEEDED,
        aggregateId: payment.id,
        aggregateType: 'Payment',
        organizationId: paymentIntent.metadata.organizationId,
        data: {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          paymentMethod: paymentIntent.charges.data[0]?.payment_method_details?.type,
        },
        metadata: {
          source: 'WEBHOOK',
          correlationId: paymentIntent.id,
        },
        version: 1,
        timestamp: new Date(),
      });
    }
  }
}
```

#### PayPal Integration
```typescript
class PayPalIntegration {
  private paypal: PayPalApi;

  async createOrder(request: PayPalOrderRequest): Promise<PayPalOrder> {
    const order = await this.paypal.orders.create({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: request.currency,
          value: request.amount.toString(),
        },
        invoice_id: request.invoiceId,
        custom_id: request.customerId,
      }],
      application_context: {
        return_url: request.returnUrl,
        cancel_url: request.cancelUrl,
        shipping_preference: 'NO_SHIPPING',
      },
    });

    return {
      id: order.id,
      status: order.status,
      approvalUrl: order.links.find(link => link.rel === 'approve')?.href,
    };
  }

  async captureOrder(orderId: string): Promise<PayPalCapture> {
    const capture = await this.paypal.orders.capture(orderId);

    // Update payment status in our system
    await this.updatePaymentFromCapture(capture);

    return capture;
  }
}
```

### Accounting Software Integrations

#### QuickBooks Online Integration
```typescript
class QuickBooksIntegration {
  private qbo: QuickBooksApi;

  async syncCustomer(customer: Customer, credentials: OAuthCredentials): Promise<void> {
    this.qbo = new QuickBooksApi(credentials);

    // Check if customer already exists
    const existingCustomer = await this.qbo.customers.findByName(customer.name);

    if (existingCustomer) {
      // Update existing customer
      await this.qbo.customers.update(existingCustomer.Id, {
        Name: customer.name,
        CompanyName: customer.businessName,
        BillAddr: this.mapAddress(customer.billingAddress),
        PrimaryEmailAddr: { Address: customer.email },
        PrimaryPhone: { FreeFormNumber: customer.phone },
      });
    } else {
      // Create new customer
      const qbCustomer = await this.qbo.customers.create({
        Name: customer.name,
        CompanyName: customer.businessName,
        BillAddr: this.mapAddress(customer.billingAddress),
        PrimaryEmailAddr: { Address: customer.email },
        PrimaryPhone: { FreeFormNumber: customer.phone },
        SyncToken: '0',
      });

      // Store QuickBooks ID for future sync
      await prisma.customerIntegration.create({
        data: {
          customerId: customer.id,
          provider: 'QUICKBOOKS',
          externalId: qbCustomer.Id,
          lastSyncAt: new Date(),
        },
      });
    }
  }

  async syncInvoice(invoice: Invoice, credentials: OAuthCredentials): Promise<void> {
    this.qbo = new QuickBooksApi(credentials);

    const customer = await this.getQBCustomer(invoice.customerId);
    const items = await this.mapInvoiceItems(invoice.lineItems);

    const qbInvoice = await this.qbo.invoices.create({
      CustomerRef: { value: customer.externalId },
      TxnDate: invoice.issueDate.toISOString().split('T')[0],
      DueDate: invoice.dueDate.toISOString().split('T')[0],
      Line: items,
      DocNumber: invoice.invoiceNumber,
    });

    await prisma.invoiceIntegration.create({
      data: {
        invoiceId: invoice.id,
        provider: 'QUICKBOOKS',
        externalId: qbInvoice.Id,
        lastSyncAt: new Date(),
      },
    });
  }

  async syncPayment(payment: Payment, credentials: OAuthCredentials): Promise<void> {
    this.qbo = new QuickBooksApi(credentials);

    const invoice = await this.getQBInvoice(payment.invoiceId);

    const qbPayment = await this.qbo.payments.create({
      CustomerRef: { value: invoice.CustomerRef.value },
      TotalAmt: payment.amount,
      Line: [{
        Amount: payment.amount,
        LinkedTxn: [{
          TxnId: invoice.externalId,
          TxnType: 'Invoice',
        }],
      }],
      PaymentMethodRef: { value: this.mapPaymentMethod(payment.method) },
    });

    await prisma.paymentIntegration.create({
      data: {
        paymentId: payment.id,
        provider: 'QUICKBOOKS',
        externalId: qbPayment.Id,
        lastSyncAt: new Date(),
      },
    });
  }
}
```

#### Xero Integration
```typescript
class XeroIntegration {
  private xero: XeroApi;

  async syncInvoice(invoice: Invoice, credentials: OAuthCredentials): Promise<void> {
    this.xero = new XeroApi(credentials);

    const contact = await this.getOrCreateContact(invoice.customerId);

    const xeroInvoice = {
      Type: 'ACCREC',
      Contact: { ContactID: contact.externalId },
      Date: invoice.issueDate.toISOString().split('T')[0],
      DueDate: invoice.dueDate.toISOString().split('T')[0],
      InvoiceNumber: invoice.invoiceNumber,
      LineItems: invoice.lineItems.map(item => ({
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unitPrice,
        AccountCode: '200', // Sales account
      })),
      Status: 'AUTHORISED',
    };

    const result = await this.xero.invoices.create(xeroInvoice);

    await prisma.invoiceIntegration.create({
      data: {
        invoiceId: invoice.id,
        provider: 'XERO',
        externalId: result.InvoiceID,
        lastSyncAt: new Date(),
      },
    });
  }

  async syncPayment(payment: Payment, credentials: OAuthCredentials): Promise<void> {
    this.xero = new XeroApi(credentials);

    const invoice = await this.getXeroInvoice(payment.invoiceId);

    const xeroPayment = {
      Invoice: { InvoiceID: invoice.externalId },
      Account: { Code: '1100' }, // Bank account
      Amount: payment.amount,
      Date: payment.processedAt.toISOString().split('T')[0],
      Reference: payment.reference,
    };

    const result = await this.xero.payments.create(xeroPayment);

    await prisma.paymentIntegration.create({
      data: {
        paymentId: payment.id,
        provider: 'XERO',
        externalId: result.PaymentID,
        lastSyncAt: new Date(),
      },
    });
  }
}
```

### E-commerce Platform Integrations

#### Shopify Integration
```typescript
class ShopifyIntegration {
  private shopify: ShopifyApi;

  async syncProducts(organizationId: string, credentials: ShopifyCredentials): Promise<void> {
    this.shopify = new ShopifyApi(credentials.shopDomain, credentials.accessToken);

    const shopifyProducts = await this.shopify.products.list();

    for (const shopifyProduct of shopifyProducts) {
      // Check if product exists in our system
      const existingProduct = await prisma.product.findFirst({
        where: {
          organizationId,
          sku: shopifyProduct.variants[0].sku,
        },
      });

      if (existingProduct) {
        // Update existing product
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: {
            name: shopifyProduct.title,
            description: shopifyProduct.body_html,
            sellingPrice: parseFloat(shopifyProduct.variants[0].price),
          },
        });
      } else {
        // Create new product
        await prisma.product.create({
          data: {
            organizationId,
            sku: shopifyProduct.variants[0].sku || generateSKU(),
            name: shopifyProduct.title,
            description: shopifyProduct.body_html,
            type: 'INVENTORY',
            sellingPrice: parseFloat(shopifyProduct.variants[0].price),
            trackInventory: true,
            isActive: shopifyProduct.status === 'active',
          },
        });
      }

      // Update inventory levels
      await this.syncInventoryLevels(shopifyProduct, organizationId);
    }
  }

  async syncOrders(organizationId: string, credentials: ShopifyCredentials): Promise<void> {
    this.shopify = new ShopifyApi(credentials.shopDomain, credentials.accessToken);

    const shopifyOrders = await this.shopify.orders.list({
      status: 'any',
      fulfillment_status: 'any',
      financial_status: 'paid',
      created_at_min: this.getLastSyncDate(organizationId),
    });

    for (const order of shopifyOrders) {
      await this.createInvoiceFromOrder(order, organizationId);
    }
  }

  private async createInvoiceFromOrder(order: ShopifyOrder, organizationId: string): Promise<void> {
    // Get or create customer
    const customer = await this.getOrCreateCustomerFromOrder(order, organizationId);

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        customerId: customer.id,
        invoiceNumber: `SHOP-${order.order_number}`,
        type: 'STANDARD',
        status: 'PAID',
        issueDate: new Date(order.created_at),
        dueDate: new Date(order.created_at),
        subtotal: parseFloat(order.subtotal_price),
        taxAmount: parseFloat(order.total_tax),
        totalAmount: parseFloat(order.total_price),
        paidAmount: parseFloat(order.total_price),
        balanceAmount: 0,
        paidAt: new Date(order.created_at),
        metadata: {
          source: 'SHOPIFY',
          shopifyOrderId: order.id,
        },
      },
    });

    // Create line items
    for (const lineItem of order.line_items) {
      await prisma.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          description: lineItem.title,
          quantity: lineItem.quantity,
          unitPrice: parseFloat(lineItem.price),
          totalPrice: parseFloat(lineItem.price) * lineItem.quantity,
        },
      });
    }

    // Create payment record
    await prisma.payment.create({
      data: {
        organizationId,
        customerId: customer.id,
        invoiceId: invoice.id,
        paymentNumber: `SHOP-PAY-${order.order_number}`,
        amount: parseFloat(order.total_price),
        method: this.mapShopifyPaymentMethod(order.gateway),
        status: 'COMPLETED',
        reference: order.id.toString(),
        processedAt: new Date(order.created_at),
        metadata: {
          source: 'SHOPIFY',
          shopifyOrderId: order.id,
        },
      },
    });
  }
}
```

## Banking & Financial Institution Integration

### Open Banking Integration
```typescript
interface OpenBankingAccount {
  accountId: string;
  accountName: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'CREDIT';
  balance: number;
  currency: string;
  institution: string;
}

interface BankTransaction {
  transactionId: string;
  accountId: string;
  amount: number;
  description: string;
  date: Date;
  type: 'DEBIT' | 'CREDIT';
  category?: string;
  merchantName?: string;
  balance?: number;
}

class OpenBankingService {
  async getAccountBalances(
    organizationId: string,
    bankCredentials: BankCredentials
  ): Promise<OpenBankingAccount[]> {
    const accounts = await this.bankApi.getAccounts(bankCredentials);

    // Store/update account information
    for (const account of accounts) {
      await this.upsertBankAccount(organizationId, account);
    }

    return accounts;
  }

  async syncTransactions(
    organizationId: string,
    accountId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<BankTransaction[]> {
    const bankAccount = await this.getBankAccount(organizationId, accountId);
    const transactions = await this.bankApi.getTransactions(
      bankAccount.externalAccountId,
      fromDate,
      toDate
    );

    // Import transactions
    for (const transaction of transactions) {
      await this.importBankTransaction(organizationId, accountId, transaction);
    }

    // Auto-match transactions with existing payments
    await this.autoMatchTransactions(organizationId, transactions);

    return transactions;
  }

  private async autoMatchTransactions(
    organizationId: string,
    transactions: BankTransaction[]
  ): Promise<void> {
    for (const transaction of transactions) {
      if (transaction.type === 'CREDIT' && transaction.amount > 0) {
        // Try to match incoming payment
        const matchingPayment = await prisma.payment.findFirst({
          where: {
            organizationId,
            amount: transaction.amount,
            status: 'PENDING',
            method: { in: ['BANK_TRANSFER', 'E_TRANSFER'] },
            createdAt: {
              gte: new Date(transaction.date.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days before
              lte: new Date(transaction.date.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days after
            },
          },
        });

        if (matchingPayment) {
          await this.reconcilePayment(matchingPayment, transaction);
        }
      }
    }
  }

  private async reconcilePayment(
    payment: Payment,
    transaction: BankTransaction
  ): Promise<void> {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        processedAt: transaction.date,
        reference: transaction.transactionId,
        metadata: {
          ...payment.metadata,
          bankTransactionId: transaction.transactionId,
          autoReconciled: true,
          reconciledAt: new Date(),
        },
      },
    });

    // Publish payment reconciliation event
    await this.eventBus.publish({
      id: generateId(),
      type: EventType.PAYMENT_RECONCILED,
      aggregateId: payment.id,
      aggregateType: 'Payment',
      organizationId: payment.organizationId,
      data: {
        bankTransactionId: transaction.transactionId,
        autoReconciled: true,
        reconciliationConfidence: 0.95, // High confidence for exact amount match
      },
      metadata: {
        source: 'SYSTEM',
        correlationId: transaction.transactionId,
      },
      version: 1,
      timestamp: new Date(),
    });
  }
}
```

## Integration Management Dashboard

### Integration Status Monitoring
```typescript
interface IntegrationStatus {
  provider: string;
  organizationId: string;
  isActive: boolean;
  lastSyncAt?: Date;
  lastSyncStatus: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  errorCount: number;
  nextSyncAt?: Date;
  syncFrequency: 'REAL_TIME' | 'HOURLY' | 'DAILY' | 'WEEKLY';
  dataTypes: string[];
  configuration: Record<string, any>;
}

class IntegrationManager {
  async getIntegrationStatus(organizationId: string): Promise<IntegrationStatus[]> {
    const integrations = await prisma.integration.findMany({
      where: { organizationId },
      include: {
        syncLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return integrations.map(integration => ({
      provider: integration.provider,
      organizationId: integration.organizationId,
      isActive: integration.isActive,
      lastSyncAt: integration.syncLogs[0]?.createdAt,
      lastSyncStatus: integration.syncLogs[0]?.status || 'UNKNOWN',
      errorCount: integration.errorCount,
      nextSyncAt: this.calculateNextSync(integration),
      syncFrequency: integration.syncFrequency,
      dataTypes: integration.dataTypes,
      configuration: integration.configuration,
    }));
  }

  async triggerSync(
    organizationId: string,
    provider: string,
    dataTypes?: string[]
  ): Promise<SyncJob> {
    const integration = await this.getIntegration(organizationId, provider);

    if (!integration.isActive) {
      throw new Error(`Integration ${provider} is not active`);
    }

    const syncJob = await prisma.syncJob.create({
      data: {
        integrationId: integration.id,
        dataTypes: dataTypes || integration.dataTypes,
        status: 'PENDING',
        triggeredBy: 'MANUAL',
      },
    });

    // Queue sync job
    await this.messageQueue.add('integration-sync', {
      syncJobId: syncJob.id,
      organizationId,
      provider,
      dataTypes: syncJob.dataTypes,
    });

    return syncJob;
  }

  async configureBidirectionalSync(
    organizationId: string,
    provider: string,
    config: BidirectionalSyncConfig
  ): Promise<void> {
    await prisma.integration.update({
      where: {
        organizationId_provider: {
          organizationId,
          provider,
        },
      },
      data: {
        configuration: {
          ...config,
          bidirectionalSync: true,
          syncDirection: 'BIDIRECTIONAL',
          conflictResolution: config.conflictResolution || 'MASTER_WINS',
          fieldMappings: config.fieldMappings,
        },
      },
    });
  }
}
```

## API Client SDKs

### JavaScript/TypeScript SDK
```typescript
class UniversalAccountingAPI {
  private baseUrl: string;
  private apiKey: string;
  private httpClient: HttpClient;

  constructor(config: APIConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.httpClient = new HttpClient({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: config.timeout || 30000,
    });
  }

  // Customer management
  customers = {
    list: (orgId: string, params?: ListParams) =>
      this.httpClient.get(`/organizations/${orgId}/customers`, { params }),

    create: (orgId: string, data: CreateCustomerRequest) =>
      this.httpClient.post(`/organizations/${orgId}/customers`, data),

    get: (orgId: string, customerId: string) =>
      this.httpClient.get(`/organizations/${orgId}/customers/${customerId}`),

    update: (orgId: string, customerId: string, data: UpdateCustomerRequest) =>
      this.httpClient.put(`/organizations/${orgId}/customers/${customerId}`, data),
  };

  // Invoice management
  invoices = {
    list: (orgId: string, params?: ListParams) =>
      this.httpClient.get(`/organizations/${orgId}/invoices`, { params }),

    create: (orgId: string, data: CreateInvoiceRequest) =>
      this.httpClient.post(`/organizations/${orgId}/invoices`, data),

    send: (orgId: string, invoiceId: string) =>
      this.httpClient.post(`/organizations/${orgId}/invoices/${invoiceId}/send`),

    generatePDF: (orgId: string, invoiceId: string) =>
      this.httpClient.get(`/organizations/${orgId}/invoices/${invoiceId}/pdf`, {
        responseType: 'blob',
      }),
  };

  // Payment processing
  payments = {
    createStripeIntent: (orgId: string, data: CreatePaymentIntentRequest) =>
      this.httpClient.post(`/organizations/${orgId}/payments/stripe/intent`, data),

    recordPayment: (orgId: string, data: RecordPaymentRequest) =>
      this.httpClient.post(`/organizations/${orgId}/payments`, data),
  };

  // Webhook management
  webhooks = {
    list: (orgId: string) =>
      this.httpClient.get(`/organizations/${orgId}/webhooks`),

    create: (orgId: string, data: CreateWebhookRequest) =>
      this.httpClient.post(`/organizations/${orgId}/webhooks`, data),

    test: (orgId: string, webhookId: string) =>
      this.httpClient.post(`/organizations/${orgId}/webhooks/${webhookId}/test`),
  };

  // Real-time subscriptions using WebSockets
  subscribe(orgId: string, events: EventType[]): EventSubscription {
    const ws = new WebSocket(`${this.baseUrl.replace('http', 'ws')}/organizations/${orgId}/events`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        events,
        apiKey: this.apiKey,
      }));
    };

    return new EventSubscription(ws, events);
  }
}

// Usage example
const api = new UniversalAccountingAPI({
  baseUrl: 'https://api.universalaccounting.com/v1',
  apiKey: 'your-api-key',
});

// Create a customer
const customer = await api.customers.create('org-123', {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  tier: 'SMALL_BUSINESS',
});

// Subscribe to real-time events
const subscription = api.subscribe('org-123', [
  EventType.INVOICE_PAID,
  EventType.PAYMENT_RECEIVED,
]);

subscription.on('invoice.paid', (event) => {
  console.log('Invoice paid:', event.data);
});
```

---

*This comprehensive integration architecture enables the Universal Accounting API to seamlessly connect with the entire business software ecosystem, providing businesses of all sizes with the flexibility to maintain their existing workflows while leveraging powerful accounting automation and insights.*