# 🧠 AI Development Tutorials

> **Comprehensive guide for building AI-powered features on top of the Enterprise Accounting API**

## 📋 Table of Contents

- [AI-Powered Features Overview](#ai-powered-features-overview)
- [Machine Learning Integration](#machine-learning-integration)
- [Automated Accounting Workflows](#automated-accounting-workflows)
- [Intelligent Invoice Processing](#intelligent-invoice-processing)
- [Predictive Analytics Implementation](#predictive-analytics-implementation)
- [AI-Assisted Customer Service](#ai-assisted-customer-service)
- [Fraud Detection Integration](#fraud-detection-integration)
- [Natural Language Processing](#natural-language-processing)

---

## 🎯 AI-Powered Features Overview

### Architecture for AI Integration

```typescript
// AI Services Architecture
interface AIArchitecture {
  // Core AI services layer
  aiServices: {
    documentProcessing: 'OCR + NLP for invoice extraction';
    predictiveAnalytics: 'ML models for forecasting';
    fraudDetection: 'Anomaly detection algorithms';
    chatbot: 'NLP-powered customer service';
    smartRecommendations: 'Recommendation engine';
  };

  // Data pipeline
  dataPipeline: {
    ingestion: 'Real-time data from accounting API';
    preprocessing: 'Data cleaning and feature engineering';
    storage: 'Feature store + model artifacts';
    inference: 'Real-time predictions';
  };

  // Integration points
  integrationPoints: {
    webhooks: 'Real-time event processing';
    batchProcessing: 'Scheduled ML jobs';
    apiEndpoints: 'Synchronous AI predictions';
    streamProcessing: 'Real-time anomaly detection';
  };
}
```

### AI Service Integration Pattern

```typescript
// Base AI service class
abstract class AIService {
  protected apiClient: AccountingAPIClient;
  protected modelEndpoint: string;
  protected cache: Cache;

  constructor(config: AIServiceConfig) {
    this.apiClient = new AccountingAPIClient(config.apiConfig);
    this.modelEndpoint = config.modelEndpoint;
    this.cache = new Cache(config.cacheConfig);
  }

  // Common methods for all AI services
  protected async fetchTrainingData(organizationId: string): Promise<any[]> {
    // Fetch relevant data from accounting API
    const [customers, invoices, payments] = await Promise.all([
      this.apiClient.customers.list({ organizationId, limit: 1000 }),
      this.apiClient.invoices.list({ organizationId, limit: 1000 }),
      this.apiClient.payments.list({ organizationId, limit: 1000 })
    ]);

    return this.preprocessData({ customers, invoices, payments });
  }

  protected abstract preprocessData(data: any): any[];
  protected abstract callMLModel(features: any): Promise<any>;

  // Caching for expensive operations
  protected async getCachedPrediction<T>(
    key: string,
    predictor: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const result = await predictor();
    await this.cache.set(key, result, ttl);
    return result;
  }
}

// Example: Intelligent invoice processing service
class IntelligentInvoiceService extends AIService {
  async extractInvoiceData(imageBuffer: Buffer): Promise<ExtractedInvoiceData> {
    const cacheKey = `invoice_extraction_${hash(imageBuffer)}`;

    return this.getCachedPrediction(cacheKey, async () => {
      // OCR + NLP processing
      const ocrResult = await this.performOCR(imageBuffer);
      const extractedData = await this.extractStructuredData(ocrResult);

      return this.validateAndEnhance(extractedData);
    });
  }

  protected preprocessData(data: any): any[] {
    // Convert accounting data to ML features
    return data.invoices.map(invoice => ({
      amount: invoice.total,
      dueDate: invoice.dueDate,
      customerTier: invoice.customer.tier,
      paymentHistory: this.calculatePaymentHistory(invoice.customerId, data.payments),
      industryCategory: this.classifyCustomerIndustry(invoice.customer)
    }));
  }

  protected async callMLModel(features: any): Promise<any> {
    const response = await fetch(`${this.modelEndpoint}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features })
    });

    return response.json();
  }
}
```

---

## 🤖 Machine Learning Integration

### Model Training Pipeline

```typescript
// ML Pipeline for accounting data
interface MLPipeline {
  dataCollection: {
    sources: ['invoices', 'payments', 'customers', 'quotes'];
    features: ['amount', 'payment_history', 'customer_tier', 'due_date'];
    labels: ['payment_likelihood', 'churn_risk', 'fraud_score'];
  };

  preprocessing: {
    cleaning: 'Remove outliers, handle missing values';
    encoding: 'Categorical encoding, normalization';
    featureEngineering: 'Create derived features';
  };

  training: {
    algorithms: ['Random Forest', 'XGBoost', 'Neural Networks'];
    validation: 'Time-series cross-validation';
    metrics: ['Precision', 'Recall', 'F1-Score', 'AUC-ROC'];
  };

  deployment: {
    serving: 'REST API endpoints';
    monitoring: 'Model drift detection';
    retraining: 'Automated retraining pipeline';
  };
}

// Feature engineering service
class FeatureEngineeringService {
  async generateCustomerFeatures(customerId: string): Promise<CustomerFeatures> {
    const [customer, invoices, payments, quotes] = await Promise.all([
      this.apiClient.customers.get(customerId),
      this.apiClient.invoices.list({ customerId }),
      this.apiClient.payments.list({ customerId }),
      this.apiClient.quotes.list({ customerId })
    ]);

    return {
      // Demographic features
      customerAge: this.calculateCustomerAge(customer.createdAt),
      customerTier: customer.tier,
      businessType: customer.business?.businessType,

      // Financial features
      totalInvoiceAmount: invoices.reduce((sum, inv) => sum + inv.total, 0),
      averageInvoiceAmount: this.calculateAverage(invoices.map(inv => inv.total)),
      paymentVelocity: this.calculatePaymentVelocity(payments),
      defaultRate: this.calculateDefaultRate(invoices, payments),

      // Behavioral features
      quoteAcceptanceRate: this.calculateQuoteAcceptanceRate(quotes),
      communicationFrequency: this.calculateCommunicationFrequency(customerId),
      seasonalityPattern: this.identifySeasonalityPattern(invoices),

      // Recency features
      daysSinceLastPayment: this.daysSince(this.getLastPaymentDate(payments)),
      daysSinceLastInvoice: this.daysSince(this.getLastInvoiceDate(invoices)),
      daysSinceLastQuote: this.daysSince(this.getLastQuoteDate(quotes))
    };
  }

  private calculatePaymentVelocity(payments: Payment[]): number {
    if (payments.length < 2) return 0;

    const sortedPayments = payments.sort((a, b) =>
      new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
    );

    const intervals = [];
    for (let i = 1; i < sortedPayments.length; i++) {
      const interval = (
        new Date(sortedPayments[i].paymentDate).getTime() -
        new Date(sortedPayments[i-1].paymentDate).getTime()
      ) / (1000 * 60 * 60 * 24); // Convert to days

      intervals.push(interval);
    }

    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  }

  private calculateDefaultRate(invoices: Invoice[], payments: Payment[]): number {
    const paidInvoices = invoices.filter(invoice =>
      payments.some(payment => payment.invoiceId === invoice.id)
    );

    return 1 - (paidInvoices.length / invoices.length);
  }
}
```

### Predictive Models Implementation

```typescript
// Payment likelihood prediction
class PaymentLikelihoodPredictor extends AIService {
  async predictPaymentLikelihood(invoiceId: string): Promise<PaymentPrediction> {
    const invoice = await this.apiClient.invoices.get(invoiceId);
    const customerFeatures = await this.featureService.generateCustomerFeatures(invoice.customerId);

    const features = {
      ...customerFeatures,
      invoiceAmount: invoice.total,
      daysUntilDue: this.calculateDaysUntilDue(invoice.dueDate),
      isBusinessCustomer: !!invoice.customer.business,
      previousPaymentTiming: await this.getPreviousPaymentTiming(invoice.customerId)
    };

    const prediction = await this.callMLModel(features);

    return {
      likelihood: prediction.probability,
      confidence: prediction.confidence,
      factors: prediction.feature_importance,
      recommendedActions: this.generateRecommendations(prediction),
      riskLevel: this.categorizeRisk(prediction.probability)
    };
  }

  private generateRecommendations(prediction: any): string[] {
    const recommendations = [];

    if (prediction.probability < 0.3) {
      recommendations.push('Send payment reminder immediately');
      recommendations.push('Consider offering payment plan');
      recommendations.push('Schedule follow-up call');
    } else if (prediction.probability < 0.7) {
      recommendations.push('Send gentle payment reminder 3 days before due date');
      recommendations.push('Monitor payment status closely');
    }

    return recommendations;
  }

  protected preprocessData(data: any): any[] {
    return data.invoices.map(invoice => {
      const payments = data.payments.filter(p => p.invoiceId === invoice.id);
      const wasPaidOnTime = payments.length > 0 &&
        new Date(payments[0].paymentDate) <= new Date(invoice.dueDate);

      return {
        amount: invoice.total,
        daysUntilDue: this.calculateDaysUntilDue(invoice.dueDate),
        customerTier: invoice.customer.tier,
        previousPaymentHistory: this.calculatePaymentHistory(invoice.customerId, data.payments),
        label: wasPaidOnTime ? 1 : 0
      };
    });
  }
}

// Customer churn prediction
class ChurnPredictionService extends AIService {
  async predictCustomerChurn(customerId: string): Promise<ChurnPrediction> {
    const cacheKey = `churn_prediction_${customerId}`;

    return this.getCachedPrediction(cacheKey, async () => {
      const features = await this.generateChurnFeatures(customerId);
      const prediction = await this.callMLModel(features);

      return {
        churnProbability: prediction.probability,
        timeToChurn: prediction.estimated_days,
        riskFactors: prediction.risk_factors,
        retentionStrategies: this.generateRetentionStrategies(prediction),
        customerValue: await this.calculateCustomerLifetimeValue(customerId)
      };
    }, 86400); // Cache for 24 hours
  }

  private async generateChurnFeatures(customerId: string): Promise<ChurnFeatures> {
    const [customer, invoices, payments, quotes, projects] = await Promise.all([
      this.apiClient.customers.get(customerId),
      this.apiClient.invoices.list({ customerId, limit: 100 }),
      this.apiClient.payments.list({ customerId, limit: 100 }),
      this.apiClient.quotes.list({ customerId, limit: 50 }),
      this.apiClient.projects.list({ customerId, limit: 50 })
    ]);

    return {
      daysSinceLastOrder: this.daysSince(this.getLastInvoiceDate(invoices)),
      recentEngagementScore: this.calculateEngagementScore(quotes, projects),
      paymentConsistency: this.calculatePaymentConsistency(payments),
      supportTickets: await this.getSupportTicketCount(customerId),
      contractValue: this.calculateContractValue(invoices),
      industryBenchmark: await this.getIndustryBenchmark(customer.business?.industryCode)
    };
  }

  private generateRetentionStrategies(prediction: any): RetentionStrategy[] {
    const strategies = [];

    if (prediction.risk_factors.includes('low_engagement')) {
      strategies.push({
        action: 'Schedule check-in call',
        priority: 'high',
        timeline: 'within 3 days'
      });
    }

    if (prediction.risk_factors.includes('payment_delays')) {
      strategies.push({
        action: 'Offer payment plan options',
        priority: 'medium',
        timeline: 'within 1 week'
      });
    }

    return strategies;
  }
}
```

---

## 🔄 Automated Accounting Workflows

### Smart Invoice Generation

```typescript
// Intelligent invoice automation
class SmartInvoiceGenerator extends AIService {
  async generateIntelligentInvoice(quoteId: string): Promise<SmartInvoice> {
    const quote = await this.apiClient.quotes.get(quoteId);
    const customerHistory = await this.getCustomerHistory(quote.customerId);

    // AI-powered optimizations
    const optimizations = await this.generateOptimizations(quote, customerHistory);

    const smartInvoice = {
      ...quote,
      // Optimized payment terms based on customer history
      paymentTerms: optimizations.recommendedPaymentTerms,

      // Dynamic due date based on payment patterns
      dueDate: optimizations.optimalDueDate,

      // Personalized messaging
      notes: optimizations.personalizedMessage,

      // Smart pricing adjustments
      items: await this.optimizeLineItems(quote.items, customerHistory),

      // Automated follow-up schedule
      followUpSchedule: optimizations.followUpSchedule
    };

    return smartInvoice;
  }

  private async generateOptimizations(
    quote: Quote,
    history: CustomerHistory
  ): Promise<InvoiceOptimizations> {
    const features = {
      customerTier: quote.customer.tier,
      averagePaymentDays: history.averagePaymentDays,
      totalPaidAmount: history.totalPaidAmount,
      seasonality: this.getCurrentSeason(),
      industryBenchmarks: await this.getIndustryBenchmarks(quote.customer.business?.industryCode)
    };

    const mlRecommendations = await this.callMLModel(features);

    return {
      recommendedPaymentTerms: this.calculateOptimalPaymentTerms(mlRecommendations),
      optimalDueDate: this.calculateOptimalDueDate(mlRecommendations),
      personalizedMessage: await this.generatePersonalizedMessage(quote.customer, history),
      followUpSchedule: this.generateFollowUpSchedule(mlRecommendations.payment_probability)
    };
  }

  private async generatePersonalizedMessage(
    customer: Customer,
    history: CustomerHistory
  ): Promise<string> {
    const templates = {
      loyalCustomer: "Thank you for your continued partnership with us.",
      newCustomer: "We're excited to work with you on this project.",
      seasonalDiscount: "Enjoy your seasonal discount as a valued customer.",
      paymentReminder: "As a friendly reminder, payment helps us continue providing excellent service."
    };

    // Determine appropriate template based on customer data
    if (history.totalTransactions > 10) {
      return templates.loyalCustomer;
    } else if (history.totalTransactions === 0) {
      return templates.newCustomer;
    }

    return templates.paymentReminder;
  }
}

// Automated payment reminders
class SmartPaymentReminders extends AIService {
  async scheduleIntelligentReminders(invoiceId: string): Promise<ReminderSchedule> {
    const invoice = await this.apiClient.invoices.get(invoiceId);
    const paymentPrediction = await this.paymentPredictor.predictPaymentLikelihood(invoiceId);

    const reminderStrategy = this.determineReminderStrategy(paymentPrediction);

    return {
      reminders: reminderStrategy.reminders,
      channels: reminderStrategy.channels,
      escalationPath: reminderStrategy.escalationPath
    };
  }

  private determineReminderStrategy(prediction: PaymentPrediction): ReminderStrategy {
    if (prediction.likelihood > 0.8) {
      // High probability of payment - gentle reminders
      return {
        reminders: [
          { days: -3, message: 'Friendly reminder: Invoice due in 3 days' },
          { days: 0, message: 'Invoice due today' },
          { days: 3, message: 'Invoice overdue - gentle follow-up' }
        ],
        channels: ['email'],
        escalationPath: ['phone_call_after_7_days']
      };
    } else if (prediction.likelihood > 0.5) {
      // Medium probability - standard approach
      return {
        reminders: [
          { days: -7, message: 'Invoice due in 1 week' },
          { days: -3, message: 'Invoice due in 3 days' },
          { days: 0, message: 'Invoice due today' },
          { days: 1, message: 'Invoice overdue' },
          { days: 7, message: 'Payment urgently required' }
        ],
        channels: ['email', 'sms'],
        escalationPath: ['phone_call_after_3_days', 'collections_after_14_days']
      };
    } else {
      // Low probability - aggressive approach
      return {
        reminders: [
          { days: -7, message: 'Invoice due in 1 week - please confirm receipt' },
          { days: -3, message: 'Invoice due in 3 days - payment plan available' },
          { days: -1, message: 'Invoice due tomorrow - immediate attention required' },
          { days: 0, message: 'Invoice due today - please contact us' },
          { days: 1, message: 'Invoice overdue - immediate payment required' }
        ],
        channels: ['email', 'sms', 'phone'],
        escalationPath: ['immediate_phone_call', 'collections_after_7_days']
      };
    }
  }
}
```

### Automated Reconciliation

```typescript
// Smart bank reconciliation
class AutomatedReconciliation extends AIService {
  async performIntelligentReconciliation(
    bankStatements: BankStatement[],
    organizationId: string
  ): Promise<ReconciliationResults> {
    // Get unmatched transactions
    const unmatchedPayments = await this.getUnmatchedPayments(organizationId);
    const unmatchedBankTransactions = this.getUnmatchedBankTransactions(bankStatements);

    // AI-powered matching
    const matches = await this.findIntelligentMatches(
      unmatchedPayments,
      unmatchedBankTransactions
    );

    // Validate matches
    const validatedMatches = await this.validateMatches(matches);

    // Auto-reconcile high-confidence matches
    const autoReconciled = await this.autoReconcileMatches(
      validatedMatches.filter(m => m.confidence > 0.9)
    );

    return {
      totalMatches: validatedMatches.length,
      autoReconciled: autoReconciled.length,
      requiresReview: validatedMatches.filter(m => m.confidence <= 0.9),
      unmatchedPayments: unmatchedPayments.filter(p =>
        !validatedMatches.some(m => m.payment.id === p.id)
      ),
      unmatchedBankTransactions: unmatchedBankTransactions.filter(t =>
        !validatedMatches.some(m => m.bankTransaction.id === t.id)
      )
    };
  }

  private async findIntelligentMatches(
    payments: Payment[],
    bankTransactions: BankTransaction[]
  ): Promise<PotentialMatch[]> {
    const matches = [];

    for (const payment of payments) {
      for (const transaction of bankTransactions) {
        const similarity = await this.calculateMatchProbability(payment, transaction);

        if (similarity.probability > 0.3) {
          matches.push({
            payment,
            bankTransaction: transaction,
            confidence: similarity.probability,
            matchingFactors: similarity.factors
          });
        }
      }
    }

    // Sort by confidence and remove duplicates
    return this.deduplicateMatches(
      matches.sort((a, b) => b.confidence - a.confidence)
    );
  }

  private async calculateMatchProbability(
    payment: Payment,
    transaction: BankTransaction
  ): Promise<MatchSimilarity> {
    const features = {
      // Amount matching
      amountExactMatch: payment.amount === transaction.amount ? 1 : 0,
      amountDifference: Math.abs(payment.amount - transaction.amount),
      amountRatio: Math.min(payment.amount, transaction.amount) /
                   Math.max(payment.amount, transaction.amount),

      // Date matching
      dateDifference: Math.abs(
        new Date(payment.paymentDate).getTime() -
        new Date(transaction.date).getTime()
      ) / (1000 * 60 * 60 * 24), // Days

      // Reference matching
      referenceMatch: this.calculateReferenceSimilarity(
        payment.referenceNumber,
        transaction.reference
      ),

      // Description matching
      descriptionSimilarity: await this.calculateTextSimilarity(
        payment.customerNotes || '',
        transaction.description
      ),

      // Customer name matching
      customerNameMatch: await this.calculateCustomerNameMatch(
        payment.customer,
        transaction.description
      )
    };

    const prediction = await this.callMLModel(features);

    return {
      probability: prediction.probability,
      factors: {
        amount: features.amountRatio,
        date: Math.max(0, 1 - features.dateDifference / 7), // Decay over 7 days
        reference: features.referenceMatch,
        description: features.descriptionSimilarity,
        customer: features.customerNameMatch
      }
    };
  }

  private async calculateTextSimilarity(text1: string, text2: string): Promise<number> {
    // Use Levenshtein distance or more sophisticated NLP
    const distance = this.levenshteinDistance(
      text1.toLowerCase().trim(),
      text2.toLowerCase().trim()
    );

    const maxLength = Math.max(text1.length, text2.length);
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }
}
```

---

## 📄 Intelligent Invoice Processing

### OCR and Data Extraction

```typescript
// Intelligent document processing
class IntelligentDocumentProcessor extends AIService {
  async processInvoiceDocument(
    documentBuffer: Buffer,
    mimeType: string
  ): Promise<ProcessedInvoiceData> {
    // Step 1: OCR extraction
    const ocrResults = await this.performOCR(documentBuffer, mimeType);

    // Step 2: Structure extraction using NLP
    const structuredData = await this.extractStructuredData(ocrResults.text);

    // Step 3: Validation and enhancement
    const validatedData = await this.validateAndEnhance(structuredData);

    // Step 4: Match with existing data
    const enrichedData = await this.enrichWithExistingData(validatedData);

    return enrichedData;
  }

  private async performOCR(buffer: Buffer, mimeType: string): Promise<OCRResult> {
    // Use cloud OCR service (Google Vision, AWS Textract, Azure Form Recognizer)
    const formData = new FormData();
    formData.append('document', buffer, { contentType: mimeType });

    const response = await fetch(`${this.ocrEndpoint}/extract`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${this.ocrApiKey}`
      }
    });

    const result = await response.json();

    return {
      text: result.text,
      confidence: result.confidence,
      boundingBoxes: result.boundingBoxes,
      tables: result.tables,
      keyValuePairs: result.keyValuePairs
    };
  }

  private async extractStructuredData(ocrText: string): Promise<ExtractedInvoiceData> {
    // Use NLP model to extract invoice fields
    const extractionRequest = {
      text: ocrText,
      extractionType: 'invoice',
      language: 'en'
    };

    const nlpResponse = await fetch(`${this.nlpEndpoint}/extract-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extractionRequest)
    });

    const extraction = await nlpResponse.json();

    return {
      invoiceNumber: extraction.invoice_number,
      issueDate: extraction.issue_date,
      dueDate: extraction.due_date,
      vendor: {
        name: extraction.vendor_name,
        address: extraction.vendor_address,
        taxId: extraction.vendor_tax_id
      },
      customer: {
        name: extraction.customer_name,
        address: extraction.customer_address
      },
      lineItems: extraction.line_items.map(item => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unit_price) || 0,
        total: parseFloat(item.total) || 0
      })),
      subtotal: parseFloat(extraction.subtotal) || 0,
      taxAmount: parseFloat(extraction.tax_amount) || 0,
      total: parseFloat(extraction.total) || 0,
      confidence: extraction.confidence
    };
  }

  private async validateAndEnhance(data: ExtractedInvoiceData): Promise<ValidatedInvoiceData> {
    const validationResults = {
      invoiceNumber: this.validateInvoiceNumber(data.invoiceNumber),
      dates: this.validateDates(data.issueDate, data.dueDate),
      amounts: this.validateAmounts(data.lineItems, data.subtotal, data.taxAmount, data.total),
      vendor: await this.validateVendor(data.vendor),
      customer: await this.validateCustomer(data.customer)
    };

    // Fix common OCR errors
    const correctedData = await this.correctCommonErrors(data, validationResults);

    return {
      ...correctedData,
      validationResults,
      overallConfidence: this.calculateOverallConfidence(validationResults),
      suggestedCorrections: this.generateSuggestedCorrections(validationResults)
    };
  }

  private async correctCommonErrors(
    data: ExtractedInvoiceData,
    validation: ValidationResults
  ): Promise<ExtractedInvoiceData> {
    const corrected = { ...data };

    // Fix date format issues
    if (!validation.dates.issueDateValid && data.issueDate) {
      corrected.issueDate = this.correctDateFormat(data.issueDate);
    }

    // Fix amount calculation errors
    if (!validation.amounts.totalsMatch) {
      corrected.total = this.recalculateTotal(data.lineItems, data.taxAmount);
    }

    // Fix common OCR character substitutions
    corrected.invoiceNumber = this.fixOCRCharacters(data.invoiceNumber);

    return corrected;
  }

  private async enrichWithExistingData(
    data: ValidatedInvoiceData
  ): Promise<ProcessedInvoiceData> {
    // Try to match with existing vendors
    const matchedVendor = await this.findMatchingVendor(data.vendor);

    // Try to match with existing customers
    const matchedCustomer = await this.findMatchingCustomer(data.customer);

    // Suggest products/services based on line items
    const suggestedProducts = await this.suggestProducts(data.lineItems);

    return {
      ...data,
      matchedVendor,
      matchedCustomer,
      suggestedProducts,
      recommendedActions: this.generateRecommendedActions(data, matchedVendor, matchedCustomer)
    };
  }

  private async findMatchingVendor(vendorData: ExtractedVendor): Promise<Vendor | null> {
    const vendors = await this.apiClient.vendors.list({ limit: 100 });

    for (const vendor of vendors.data) {
      const similarity = await this.calculateVendorSimilarity(vendorData, vendor);
      if (similarity > 0.8) {
        return vendor;
      }
    }

    return null;
  }

  private async calculateVendorSimilarity(
    extracted: ExtractedVendor,
    existing: Vendor
  ): Promise<number> {
    const features = {
      nameSimilarity: await this.calculateTextSimilarity(
        extracted.name,
        existing.business.legalName
      ),
      addressSimilarity: await this.calculateTextSimilarity(
        extracted.address,
        existing.addresses[0]?.address?.line1 || ''
      ),
      taxIdMatch: extracted.taxId === existing.business.taxNumber ? 1 : 0
    };

    // Weighted similarity score
    return (features.nameSimilarity * 0.5) +
           (features.addressSimilarity * 0.3) +
           (features.taxIdMatch * 0.2);
  }
}
```

### Smart Invoice Approval Workflow

```typescript
// Intelligent invoice approval system
class SmartInvoiceApproval extends AIService {
  async processInvoiceForApproval(invoiceId: string): Promise<ApprovalDecision> {
    const invoice = await this.apiClient.invoices.get(invoiceId);

    // Risk assessment
    const riskAssessment = await this.assessInvoiceRisk(invoice);

    // Fraud detection
    const fraudScore = await this.calculateFraudScore(invoice);

    // Business rules evaluation
    const rulesEvaluation = await this.evaluateBusinessRules(invoice);

    // Generate approval decision
    const decision = this.generateApprovalDecision(
      riskAssessment,
      fraudScore,
      rulesEvaluation
    );

    return decision;
  }

  private async assessInvoiceRisk(invoice: Invoice): Promise<RiskAssessment> {
    const features = {
      amount: invoice.total,
      customerHistory: await this.getCustomerRiskProfile(invoice.customerId),
      paymentTerms: invoice.paymentTerms,
      daysUntilDue: this.calculateDaysUntilDue(invoice.dueDate),
      seasonality: this.getCurrentSeason(),
      industryRisk: await this.getIndustryRiskScore(invoice.customer.business?.industryCode)
    };

    const riskPrediction = await this.callMLModel(features);

    return {
      overallRiskScore: riskPrediction.risk_score,
      riskFactors: riskPrediction.risk_factors,
      riskCategory: this.categorizeRisk(riskPrediction.risk_score),
      mitigationStrategies: this.generateMitigationStrategies(riskPrediction)
    };
  }

  private async calculateFraudScore(invoice: Invoice): Promise<FraudAssessment> {
    const features = {
      // Amount anomalies
      amountDeviationFromNorm: await this.calculateAmountDeviation(invoice),

      // Timing anomalies
      invoiceTimingAnomaly: this.detectTimingAnomalies(invoice),

      // Customer behavior anomalies
      customerBehaviorAnomaly: await this.detectCustomerBehaviorAnomalies(invoice.customerId),

      // Line item anomalies
      lineItemAnomalies: this.detectLineItemAnomalies(invoice.items),

      // Vendor relationship anomalies
      vendorRelationshipAnomaly: await this.detectVendorAnomalies(invoice)
    };

    const fraudPrediction = await this.callMLModel(features);

    return {
      fraudScore: fraudPrediction.fraud_score,
      anomalies: fraudPrediction.detected_anomalies,
      confidence: fraudPrediction.confidence,
      investigationRequired: fraudPrediction.fraud_score > 0.7
    };
  }

  private generateApprovalDecision(
    risk: RiskAssessment,
    fraud: FraudAssessment,
    rules: BusinessRulesEvaluation
  ): ApprovalDecision {
    // Auto-approval criteria
    if (
      fraud.fraudScore < 0.2 &&
      risk.overallRiskScore < 0.3 &&
      rules.allRulesPassed
    ) {
      return {
        decision: 'AUTO_APPROVED',
        confidence: 0.95,
        reasoning: 'Low risk, no fraud indicators, all business rules passed',
        requiredActions: []
      };
    }

    // Auto-rejection criteria
    if (
      fraud.fraudScore > 0.8 ||
      risk.overallRiskScore > 0.9 ||
      rules.criticalRulesFailed
    ) {
      return {
        decision: 'AUTO_REJECTED',
        confidence: 0.9,
        reasoning: 'High fraud risk or critical business rule violations',
        requiredActions: ['INVESTIGATE_FRAUD', 'CONTACT_CUSTOMER']
      };
    }

    // Manual review required
    return {
      decision: 'MANUAL_REVIEW_REQUIRED',
      confidence: 0.7,
      reasoning: 'Medium risk indicators require human review',
      requiredActions: this.generateReviewActions(risk, fraud, rules),
      recommendedReviewer: this.selectReviewer(risk, fraud, rules),
      priority: this.calculateReviewPriority(risk, fraud, rules)
    };
  }
}
```

---

## 📈 Predictive Analytics Implementation

### Revenue Forecasting

```typescript
// AI-powered revenue forecasting
class RevenueForecastingService extends AIService {
  async generateRevenueForecast(
    organizationId: string,
    forecastPeriods: number = 12,
    granularity: 'monthly' | 'weekly' | 'daily' = 'monthly'
  ): Promise<RevenueForecast> {
    // Collect historical data
    const historicalData = await this.collectHistoricalData(organizationId, granularity);

    // Generate features
    const features = await this.generateForecastingFeatures(historicalData);

    // Create multiple forecast models
    const forecasts = await Promise.all([
      this.generateTimeSeriesForecast(features, forecastPeriods),
      this.generateRegressionForecast(features, forecastPeriods),
      this.generateSeasonalForecast(features, forecastPeriods)
    ]);

    // Ensemble the forecasts
    const ensembleForecast = this.ensembleForecasts(forecasts);

    return {
      forecast: ensembleForecast,
      confidence: this.calculateForecastConfidence(forecasts),
      insights: this.generateRevenueInsights(historicalData, ensembleForecast),
      recommendations: this.generateRevenueRecommendations(ensembleForecast)
    };
  }

  private async collectHistoricalData(
    organizationId: string,
    granularity: string
  ): Promise<HistoricalRevenueData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 3); // 3 years of history

    const [invoices, payments, customers, quotes] = await Promise.all([
      this.apiClient.invoices.list({
        organizationId,
        dateRange: { start: startDate, end: endDate },
        limit: 10000
      }),
      this.apiClient.payments.list({
        organizationId,
        dateRange: { start: startDate, end: endDate },
        limit: 10000
      }),
      this.apiClient.customers.list({ organizationId, limit: 1000 }),
      this.apiClient.quotes.list({
        organizationId,
        dateRange: { start: startDate, end: endDate },
        limit: 5000
      })
    ]);

    return this.aggregateDataByPeriod(
      { invoices, payments, customers, quotes },
      granularity
    );
  }

  private async generateForecastingFeatures(
    data: HistoricalRevenueData
  ): Promise<ForecastingFeatures> {
    return {
      // Time series features
      revenue: data.periods.map(p => p.revenue),
      invoiceCount: data.periods.map(p => p.invoiceCount),
      averageInvoiceValue: data.periods.map(p => p.averageInvoiceValue),

      // Seasonal features
      month: data.periods.map(p => p.month),
      quarter: data.periods.map(p => p.quarter),
      yearOverYearGrowth: this.calculateYoYGrowth(data.periods),

      // Customer features
      newCustomers: data.periods.map(p => p.newCustomers),
      customerChurn: data.periods.map(p => p.customerChurn),
      customerLifetimeValue: data.periods.map(p => p.avgCustomerLTV),

      // Sales pipeline features
      quotesGenerated: data.periods.map(p => p.quotesGenerated),
      quoteAcceptanceRate: data.periods.map(p => p.quoteAcceptanceRate),
      salesCycleLength: data.periods.map(p => p.avgSalesCycleLength),

      // External factors
      economicIndicators: await this.getEconomicIndicators(data.periods),
      industryBenchmarks: await this.getIndustryBenchmarks(data.periods)
    };
  }

  private async generateTimeSeriesForecast(
    features: ForecastingFeatures,
    periods: number
  ): Promise<ForecastResult> {
    // Use ARIMA, Prophet, or LSTM model
    const timeSeriesRequest = {
      timeSeries: features.revenue,
      seasonality: true,
      trend: true,
      forecastPeriods: periods,
      confidenceLevel: 0.95
    };

    const response = await fetch(`${this.modelEndpoint}/timeseries-forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeSeriesRequest)
    });

    return response.json();
  }

  private ensembleForecasts(forecasts: ForecastResult[]): EnsembleForecast {
    // Weighted average based on historical accuracy
    const weights = [0.4, 0.35, 0.25]; // Time series, regression, seasonal

    const ensembledValues = [];
    const ensembledConfidence = [];

    for (let i = 0; i < forecasts[0].values.length; i++) {
      let weightedSum = 0;
      let weightedConfidence = 0;
      let totalWeight = 0;

      for (let j = 0; j < forecasts.length; j++) {
        const weight = weights[j] * forecasts[j].confidence[i];
        weightedSum += forecasts[j].values[i] * weight;
        weightedConfidence += forecasts[j].confidence[i] * weight;
        totalWeight += weight;
      }

      ensembledValues.push(weightedSum / totalWeight);
      ensembledConfidence.push(weightedConfidence / totalWeight);
    }

    return {
      values: ensembledValues,
      confidence: ensembledConfidence,
      upperBound: ensembledValues.map((v, i) => v * (1 + (1 - ensembledConfidence[i]) * 0.5)),
      lowerBound: ensembledValues.map((v, i) => v * (1 - (1 - ensembledConfidence[i]) * 0.5))
    };
  }

  private generateRevenueInsights(
    historical: HistoricalRevenueData,
    forecast: EnsembleForecast
  ): RevenueInsight[] {
    const insights = [];

    // Growth trend analysis
    const recentGrowth = this.calculateGrowthTrend(historical.periods.slice(-6));
    if (recentGrowth > 0.1) {
      insights.push({
        type: 'positive_trend',
        message: `Revenue has grown ${(recentGrowth * 100).toFixed(1)}% over the last 6 months`,
        confidence: 0.9
      });
    }

    // Seasonality insights
    const seasonalPattern = this.detectSeasonalPattern(historical.periods);
    if (seasonalPattern.strength > 0.3) {
      insights.push({
        type: 'seasonality',
        message: `Strong seasonal pattern detected with peak in ${seasonalPattern.peakMonth}`,
        confidence: seasonalPattern.strength
      });
    }

    // Forecast insights
    const forecastGrowth = (forecast.values[11] - historical.periods.slice(-1)[0].revenue) /
                          historical.periods.slice(-1)[0].revenue;
    insights.push({
      type: 'forecast_growth',
      message: `Forecasted ${forecastGrowth > 0 ? 'growth' : 'decline'} of ${(Math.abs(forecastGrowth) * 100).toFixed(1)}% over next 12 months`,
      confidence: forecast.confidence[11]
    });

    return insights;
  }
}
```

### Customer Behavior Prediction

```typescript
// Advanced customer behavior analytics
class CustomerBehaviorPredictor extends AIService {
  async predictCustomerBehavior(customerId: string): Promise<CustomerBehaviorPrediction> {
    const customerData = await this.collectCustomerData(customerId);
    const behaviorFeatures = await this.generateBehaviorFeatures(customerData);

    const predictions = await Promise.all([
      this.predictPurchaseProbability(behaviorFeatures),
      this.predictLifetimeValue(behaviorFeatures),
      this.predictChurnRisk(behaviorFeatures),
      this.predictPaymentBehavior(behaviorFeatures),
      this.predictSeasonalTrends(behaviorFeatures)
    ]);

    return {
      customerId,
      purchaseProbability: predictions[0],
      lifetimeValue: predictions[1],
      churnRisk: predictions[2],
      paymentBehavior: predictions[3],
      seasonalTrends: predictions[4],
      recommendations: this.generateCustomerRecommendations(predictions),
      nextBestActions: this.determineNextBestActions(predictions)
    };
  }

  private async generateBehaviorFeatures(
    customerData: CustomerData
  ): Promise<BehaviorFeatures> {
    return {
      // Transaction features
      totalSpent: customerData.payments.reduce((sum, p) => sum + p.amount, 0),
      averageOrderValue: this.calculateAverageOrderValue(customerData.invoices),
      orderFrequency: this.calculateOrderFrequency(customerData.invoices),
      lastPurchaseDate: this.getLastPurchaseDate(customerData.invoices),

      // Engagement features
      emailEngagement: await this.calculateEmailEngagement(customerData.customerId),
      responseTime: this.calculateAverageResponseTime(customerData.communications),
      supportTickets: customerData.supportTickets.length,

      // Payment features
      averagePaymentDelay: this.calculateAveragePaymentDelay(
        customerData.invoices,
        customerData.payments
      ),
      paymentMethodPreference: this.getPreferredPaymentMethod(customerData.payments),
      creditUtilization: this.calculateCreditUtilization(customerData.customer),

      // Behavioral features
      browserBehavior: await this.getBrowserBehavior(customerData.customerId),
      referralActivity: await this.getReferralActivity(customerData.customerId),
      socialMediaActivity: await this.getSocialMediaActivity(customerData.customer)
    };
  }

  private async predictPurchaseProbability(
    features: BehaviorFeatures
  ): Promise<PurchasePrediction> {
    const purchaseFeatures = {
      daysSinceLastPurchase: this.daysSince(features.lastPurchaseDate),
      orderFrequency: features.orderFrequency,
      averageOrderValue: features.averageOrderValue,
      seasonality: this.getCurrentSeason(),
      emailEngagement: features.emailEngagement,
      browserActivity: features.browserBehavior.sessionCount
    };

    const prediction = await this.callMLModel(purchaseFeatures);

    return {
      probability: prediction.probability,
      timeframe: prediction.predicted_timeframe,
      expectedValue: prediction.expected_order_value,
      triggers: prediction.key_triggers,
      confidence: prediction.confidence
    };
  }

  private async predictLifetimeValue(
    features: BehaviorFeatures
  ): Promise<LifetimeValuePrediction> {
    const ltvFeatures = {
      currentSpent: features.totalSpent,
      orderFrequency: features.orderFrequency,
      averageOrderValue: features.averageOrderValue,
      customerAge: this.calculateCustomerAge(features.lastPurchaseDate),
      paymentReliability: 1 - (features.averagePaymentDelay / 30), // Normalize to 0-1
      engagementScore: features.emailEngagement,
      referralActivity: features.referralActivity.count
    };

    const prediction = await this.callMLModel(ltvFeatures);

    return {
      predictedLTV: prediction.lifetime_value,
      confidence: prediction.confidence,
      timeHorizon: prediction.time_horizon_months,
      keyDrivers: prediction.key_drivers,
      segment: this.categorizeCustomerValue(prediction.lifetime_value)
    };
  }

  private generateCustomerRecommendations(
    predictions: any[]
  ): CustomerRecommendation[] {
    const recommendations = [];

    const [purchase, ltv, churn, payment, seasonal] = predictions;

    // High-value customer with high churn risk
    if (ltv.predictedLTV > 10000 && churn.churnProbability > 0.7) {
      recommendations.push({
        priority: 'high',
        action: 'immediate_retention_campaign',
        message: 'High-value customer at risk of churning - immediate intervention required',
        expectedImpact: ltv.predictedLTV * churn.churnProbability
      });
    }

    // High purchase probability
    if (purchase.probability > 0.8) {
      recommendations.push({
        priority: 'medium',
        action: 'targeted_sales_campaign',
        message: `High purchase probability (${(purchase.probability * 100).toFixed(1)}%) - send targeted offer`,
        expectedImpact: purchase.expectedValue
      });
    }

    // Payment behavior issues
    if (payment.defaultProbability > 0.5) {
      recommendations.push({
        priority: 'medium',
        action: 'payment_terms_adjustment',
        message: 'Adjust payment terms or require upfront payment',
        expectedImpact: -payment.potentialLoss
      });
    }

    return recommendations;
  }
}
```

---

## 🎤 AI-Assisted Customer Service

### Intelligent Chatbot

```typescript
// AI-powered customer service chatbot
class AccountingChatbot extends AIService {
  async processCustomerQuery(
    customerId: string,
    message: string,
    context: ConversationContext
  ): Promise<ChatbotResponse> {
    // Understand the intent
    const intent = await this.classifyIntent(message);

    // Extract entities
    const entities = await this.extractEntities(message);

    // Get customer context
    const customerContext = await this.getCustomerContext(customerId);

    // Generate response based on intent
    const response = await this.generateResponse(intent, entities, customerContext, context);

    return response;
  }

  private async classifyIntent(message: string): Promise<IntentClassification> {
    const intentRequest = {
      text: message,
      domain: 'accounting',
      language: 'en'
    };

    const response = await fetch(`${this.nlpEndpoint}/classify-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intentRequest)
    });

    return response.json();
  }

  private async extractEntities(message: string): Promise<ExtractedEntities> {
    // Extract relevant entities like invoice numbers, amounts, dates
    const entityRequest = {
      text: message,
      entityTypes: [
        'invoice_number',
        'payment_amount',
        'date',
        'customer_name',
        'payment_method'
      ]
    };

    const response = await fetch(`${this.nlpEndpoint}/extract-entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entityRequest)
    });

    return response.json();
  }

  private async generateResponse(
    intent: IntentClassification,
    entities: ExtractedEntities,
    customerContext: CustomerContext,
    conversationContext: ConversationContext
  ): Promise<ChatbotResponse> {
    switch (intent.intent) {
      case 'invoice_inquiry':
        return this.handleInvoiceInquiry(entities, customerContext);

      case 'payment_status':
        return this.handlePaymentStatusInquiry(entities, customerContext);

      case 'payment_processing':
        return this.handlePaymentProcessing(entities, customerContext);

      case 'account_balance':
        return this.handleAccountBalanceInquiry(customerContext);

      case 'dispute_inquiry':
        return this.handleDisputeInquiry(entities, customerContext);

      default:
        return this.handleGeneralInquiry(intent, entities, customerContext);
    }
  }

  private async handleInvoiceInquiry(
    entities: ExtractedEntities,
    context: CustomerContext
  ): Promise<ChatbotResponse> {
    if (entities.invoice_number) {
      // Specific invoice inquiry
      try {
        const invoice = await this.apiClient.invoices.getByNumber(
          entities.invoice_number,
          context.organizationId
        );

        if (invoice.customerId !== context.customerId) {
          return {
            message: "I'm sorry, but I can't find that invoice in your account. Please check the invoice number and try again.",
            type: 'error',
            suggestedActions: ['contact_support']
          };
        }

        return {
          message: `I found invoice ${invoice.invoiceNumber}. Here are the details:`,
          type: 'success',
          data: {
            invoice: {
              number: invoice.invoiceNumber,
              amount: invoice.total,
              dueDate: invoice.dueDate,
              status: invoice.status,
              balance: invoice.balance
            }
          },
          suggestedActions: invoice.balance > 0 ? ['make_payment'] : ['download_invoice']
        };
      } catch (error) {
        return {
          message: "I couldn't find an invoice with that number. Would you like me to show you all your recent invoices instead?",
          type: 'info',
          suggestedActions: ['show_recent_invoices', 'contact_support']
        };
      }
    } else {
      // General invoice inquiry
      const recentInvoices = await this.apiClient.invoices.list({
        customerId: context.customerId,
        limit: 5,
        orderBy: 'issueDate',
        order: 'desc'
      });

      return {
        message: "Here are your recent invoices:",
        type: 'success',
        data: {
          invoices: recentInvoices.data.map(inv => ({
            number: inv.invoiceNumber,
            amount: inv.total,
            dueDate: inv.dueDate,
            status: inv.status
          }))
        },
        suggestedActions: ['make_payment', 'download_invoice']
      };
    }
  }

  private async handlePaymentProcessing(
    entities: ExtractedEntities,
    context: CustomerContext
  ): Promise<ChatbotResponse> {
    // Check if customer wants to make a payment
    if (entities.payment_amount || entities.invoice_number) {
      const amount = entities.payment_amount?.value;
      const invoiceNumber = entities.invoice_number?.value;

      // Generate secure payment link
      const paymentLink = await this.generateSecurePaymentLink({
        customerId: context.customerId,
        amount,
        invoiceNumber
      });

      return {
        message: "I'd be happy to help you make a payment. I've generated a secure payment link for you.",
        type: 'success',
        data: {
          paymentLink: paymentLink.url,
          expiresAt: paymentLink.expiresAt
        },
        suggestedActions: ['make_payment', 'setup_autopay']
      };
    }

    return {
      message: "I can help you process a payment. Which invoice would you like to pay, or would you like to make a general payment?",
      type: 'question',
      suggestedActions: ['show_outstanding_invoices', 'make_general_payment']
    };
  }

  private async handleAccountBalanceInquiry(
    context: CustomerContext
  ): Promise<ChatbotResponse> {
    const [outstandingInvoices, recentPayments] = await Promise.all([
      this.apiClient.invoices.list({
        customerId: context.customerId,
        status: ['SENT', 'PARTIAL', 'OVERDUE']
      }),
      this.apiClient.payments.list({
        customerId: context.customerId,
        limit: 5,
        orderBy: 'paymentDate',
        order: 'desc'
      })
    ]);

    const totalBalance = outstandingInvoices.data.reduce((sum, inv) => sum + inv.balance, 0);
    const overdueAmount = outstandingInvoices.data
      .filter(inv => new Date(inv.dueDate) < new Date())
      .reduce((sum, inv) => sum + inv.balance, 0);

    return {
      message: `Here's your account summary:`,
      type: 'success',
      data: {
        totalBalance,
        overdueAmount,
        outstandingInvoices: outstandingInvoices.data.length,
        lastPaymentDate: recentPayments.data[0]?.paymentDate,
        lastPaymentAmount: recentPayments.data[0]?.amount
      },
      suggestedActions: totalBalance > 0 ? ['make_payment', 'setup_payment_plan'] : ['view_payment_history']
    };
  }
}

// Chatbot training and improvement
class ChatbotTrainingService extends AIService {
  async improveFromConversations(): Promise<void> {
    // Collect conversation data
    const conversations = await this.collectConversationData();

    // Identify improvement opportunities
    const improvements = await this.identifyImprovements(conversations);

    // Update models
    await this.updateModels(improvements);

    // Deploy improved models
    await this.deployUpdatedModels();
  }

  private async identifyImprovements(
    conversations: Conversation[]
  ): Promise<ImprovementOpportunities> {
    return {
      // Intent classification improvements
      intentMisclassifications: this.findMisclassifiedIntents(conversations),

      // Entity extraction improvements
      entityMisses: this.findMissedEntities(conversations),

      // Response quality improvements
      lowSatisfactionResponses: this.findLowSatisfactionResponses(conversations),

      // New intents to train
      newIntentPatterns: this.discoverNewIntentPatterns(conversations)
    };
  }

  private async updateModels(improvements: ImprovementOpportunities): Promise<void> {
    // Retrain intent classifier
    if (improvements.intentMisclassifications.length > 0) {
      await this.retrainIntentClassifier(improvements.intentMisclassifications);
    }

    // Retrain entity extractor
    if (improvements.entityMisses.length > 0) {
      await this.retrainEntityExtractor(improvements.entityMisses);
    }

    // Update response templates
    if (improvements.lowSatisfactionResponses.length > 0) {
      await this.updateResponseTemplates(improvements.lowSatisfactionResponses);
    }
  }
}
```

### Smart Knowledge Base

```typescript
// Intelligent knowledge base for customer service
class SmartKnowledgeBase extends AIService {
  async findRelevantArticles(
    query: string,
    context: CustomerContext
  ): Promise<KnowledgeBaseResult[]> {
    // Semantic search for relevant articles
    const semanticMatches = await this.performSemanticSearch(query);

    // Context-aware filtering
    const contextualMatches = await this.filterByContext(semanticMatches, context);

    // Personalization based on customer history
    const personalizedResults = await this.personalizeResults(contextualMatches, context);

    return personalizedResults;
  }

  private async performSemanticSearch(query: string): Promise<SemanticMatch[]> {
    // Use vector embeddings to find semantically similar content
    const queryEmbedding = await this.generateEmbedding(query);

    const searchRequest = {
      embedding: queryEmbedding,
      topK: 20,
      threshold: 0.7
    };

    const response = await fetch(`${this.searchEndpoint}/semantic-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchRequest)
    });

    return response.json();
  }

  private async filterByContext(
    matches: SemanticMatch[],
    context: CustomerContext
  ): Promise<ContextualMatch[]> {
    return matches.map(match => {
      let relevanceScore = match.similarity;

      // Boost relevance based on customer tier
      if (context.customerTier === 'ENTERPRISE' && match.article.tags.includes('enterprise')) {
        relevanceScore *= 1.2;
      }

      // Boost relevance based on current issues
      const hasCurrentIssues = context.openTickets.some(ticket =>
        match.article.tags.includes(ticket.category)
      );
      if (hasCurrentIssues) {
        relevanceScore *= 1.3;
      }

      // Reduce relevance for already viewed articles
      if (context.viewedArticles.includes(match.article.id)) {
        relevanceScore *= 0.8;
      }

      return {
        ...match,
        contextualRelevance: relevanceScore
      };
    }).sort((a, b) => b.contextualRelevance - a.contextualRelevance);
  }

  async generateContextualAnswer(
    question: string,
    relevantArticles: KnowledgeBaseResult[],
    customerContext: CustomerContext
  ): Promise<ContextualAnswer> {
    // Combine information from multiple articles
    const combinedContext = relevantArticles
      .map(article => article.content)
      .join('\n\n');

    // Generate personalized answer
    const answerRequest = {
      question,
      context: combinedContext,
      customerTier: customerContext.customerTier,
      customerHistory: customerContext.accountSummary
    };

    const response = await fetch(`${this.nlpEndpoint}/generate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answerRequest)
    });

    const generatedAnswer = await response.json();

    return {
      answer: generatedAnswer.text,
      confidence: generatedAnswer.confidence,
      sources: relevantArticles.map(article => ({
        title: article.title,
        url: article.url,
        relevance: article.relevance
      })),
      suggestedFollowUps: generatedAnswer.followUpQuestions,
      escalationRecommended: generatedAnswer.confidence < 0.7
    };
  }
}
```

---

## 🛡️ Fraud Detection Integration

### Real-time Fraud Detection

```typescript
// Comprehensive fraud detection system
class FraudDetectionService extends AIService {
  async analyzeTransaction(
    transactionData: TransactionData,
    realTimeContext: RealTimeContext
  ): Promise<FraudAnalysis> {
    // Multiple detection strategies
    const analyses = await Promise.all([
      this.analyzeAmountAnomalies(transactionData),
      this.analyzeTimingAnomalies(transactionData, realTimeContext),
      this.analyzeLocationAnomalies(transactionData, realTimeContext),
      this.analyzeBehaviorAnomalies(transactionData),
      this.analyzeNetworkAnomalies(realTimeContext),
      this.checkBlacklists(transactionData, realTimeContext)
    ]);

    // Combine analyses
    const combinedAnalysis = this.combineAnalyses(analyses);

    // Real-time decision
    const decision = this.makeRealTimeDecision(combinedAnalysis);

    return {
      overallRiskScore: combinedAnalysis.riskScore,
      riskLevel: this.categorizeRisk(combinedAnalysis.riskScore),
      detectedAnomalies: combinedAnalysis.anomalies,
      decision: decision.action,
      confidence: decision.confidence,
      recommendedActions: decision.actions,
      investigationRequired: combinedAnalysis.riskScore > 0.7
    };
  }

  private async analyzeAmountAnomalies(
    transaction: TransactionData
  ): Promise<AmountAnomalyAnalysis> {
    // Get customer's historical transaction patterns
    const customerHistory = await this.getCustomerTransactionHistory(transaction.customerId);

    const features = {
      amount: transaction.amount,
      customerAverageAmount: this.calculateAverageAmount(customerHistory),
      customerMaxAmount: Math.max(...customerHistory.map(t => t.amount)),
      amountPercentile: this.calculatePercentile(transaction.amount, customerHistory),
      roundAmount: this.isRoundAmount(transaction.amount),
      industryAverage: await this.getIndustryAverageAmount(transaction.customerIndustry)
    };

    const prediction = await this.callMLModel(features);

    return {
      isAnomalous: prediction.is_anomalous,
      anomalyScore: prediction.anomaly_score,
      factors: {
        unusuallyHigh: features.amountPercentile > 0.95,
        unusuallyLow: features.amountPercentile < 0.05,
        suspiciouslyRound: features.roundAmount && transaction.amount > 1000,
        industryDeviation: Math.abs(transaction.amount - features.industryAverage) / features.industryAverage > 2
      }
    };
  }

  private async analyzeTimingAnomalies(
    transaction: TransactionData,
    context: RealTimeContext
  ): Promise<TimingAnomalyAnalysis> {
    const customerTimePattern = await this.getCustomerTimePattern(transaction.customerId);

    const currentHour = new Date(transaction.timestamp).getHours();
    const currentDay = new Date(transaction.timestamp).getDay();

    const features = {
      hour: currentHour,
      dayOfWeek: currentDay,
      customerTypicalHours: customerTimePattern.typicalHours,
      customerTypicalDays: customerTimePattern.typicalDays,
      timeSinceLastTransaction: context.timeSinceLastTransaction,
      transactionVelocity: context.recentTransactionCount
    };

    const prediction = await this.callMLModel(features);

    return {
      isAnomalous: prediction.is_anomalous,
      anomalyScore: prediction.anomaly_score,
      factors: {
        unusualHour: !customerTimePattern.typicalHours.includes(currentHour),
        unusualDay: !customerTimePattern.typicalDays.includes(currentDay),
        highVelocity: context.recentTransactionCount > 5, // 5 transactions in last hour
        businessHoursAnomaly: this.isBusinessHoursAnomaly(transaction, customerTimePattern)
      }
    };
  }

  private async analyzeLocationAnomalies(
    transaction: TransactionData,
    context: RealTimeContext
  ): Promise<LocationAnomalyAnalysis> {
    if (!context.ipAddress) {
      return { isAnomalous: false, anomalyScore: 0, factors: {} };
    }

    const locationData = await this.getLocationFromIP(context.ipAddress);
    const customerLocationHistory = await this.getCustomerLocationHistory(transaction.customerId);

    const features = {
      currentCountry: locationData.country,
      currentCity: locationData.city,
      customerCountries: customerLocationHistory.countries,
      customerCities: customerLocationHistory.cities,
      distanceFromUsual: this.calculateDistanceFromUsualLocation(locationData, customerLocationHistory),
      isVPN: locationData.isVPN,
      isProxy: locationData.isProxy
    };

    const prediction = await this.callMLModel(features);

    return {
      isAnomalous: prediction.is_anomalous,
      anomalyScore: prediction.anomaly_score,
      factors: {
        newCountry: !features.customerCountries.includes(features.currentCountry),
        newCity: !features.customerCities.includes(features.currentCity),
        largeDistance: features.distanceFromUsual > 1000, // km
        vpnUsage: features.isVPN,
        proxyUsage: features.isProxy,
        highRiskCountry: await this.isHighRiskCountry(features.currentCountry)
      }
    };
  }

  private makeRealTimeDecision(analysis: CombinedFraudAnalysis): FraudDecision {
    if (analysis.riskScore >= 0.9) {
      return {
        action: 'BLOCK',
        confidence: 0.95,
        actions: [
          'Block transaction immediately',
          'Notify security team',
          'Lock customer account temporarily',
          'Initiate investigation'
        ]
      };
    } else if (analysis.riskScore >= 0.7) {
      return {
        action: 'MANUAL_REVIEW',
        confidence: 0.8,
        actions: [
          'Hold transaction for manual review',
          'Request additional verification',
          'Contact customer for confirmation',
          'Flag for security monitoring'
        ]
      };
    } else if (analysis.riskScore >= 0.5) {
      return {
        action: 'ADDITIONAL_VERIFICATION',
        confidence: 0.7,
        actions: [
          'Request additional authentication',
          'Send verification code',
          'Log for monitoring',
          'Proceed with caution'
        ]
      };
    } else {
      return {
        action: 'ALLOW',
        confidence: 0.9,
        actions: [
          'Process transaction normally',
          'Log for pattern analysis'
        ]
      };
    }
  }
}

// Fraud pattern learning system
class FraudPatternLearning extends AIService {
  async updateFraudModels(): Promise<void> {
    // Collect recent fraud cases
    const confirmedFraud = await this.getConfirmedFraudCases();
    const falsePositives = await this.getFalsePositives();

    // Extract new patterns
    const newPatterns = await this.extractFraudPatterns(confirmedFraud);

    // Update model weights
    await this.updateModelWeights(confirmedFraud, falsePositives);

    // Deploy updated models
    await this.deployUpdatedModels();
  }

  private async extractFraudPatterns(
    fraudCases: FraudCase[]
  ): Promise<FraudPattern[]> {
    const patterns = [];

    // Temporal patterns
    const temporalPattern = this.extractTemporalPatterns(fraudCases);
    if (temporalPattern.confidence > 0.8) {
      patterns.push(temporalPattern);
    }

    // Amount patterns
    const amountPattern = this.extractAmountPatterns(fraudCases);
    if (amountPattern.confidence > 0.8) {
      patterns.push(amountPattern);
    }

    // Geographic patterns
    const geoPattern = this.extractGeographicPatterns(fraudCases);
    if (geoPattern.confidence > 0.8) {
      patterns.push(geoPattern);
    }

    // Behavioral patterns
    const behaviorPattern = this.extractBehavioralPatterns(fraudCases);
    if (behaviorPattern.confidence > 0.8) {
      patterns.push(behaviorPattern);
    }

    return patterns;
  }

  private async updateModelWeights(
    confirmedFraud: FraudCase[],
    falsePositives: FraudCase[]
  ): Promise<void> {
    // Create training data
    const trainingData = [
      ...confirmedFraud.map(case_ => ({ ...case_, label: 1 })),
      ...falsePositives.map(case_ => ({ ...case_, label: 0 }))
    ];

    // Retrain models with new data
    await this.retrainModels(trainingData);

    // Validate model performance
    const validation = await this.validateModelPerformance();

    if (validation.accuracy > 0.95 && validation.falsePositiveRate < 0.05) {
      console.log('Model update successful');
    } else {
      console.log('Model update failed validation - rolling back');
      await this.rollbackModels();
    }
  }
}
```

This comprehensive AI Development Tutorials document provides detailed guidance for building sophisticated AI-powered features on top of the accounting API. It covers everything from basic ML integration patterns to advanced fraud detection systems, with practical code examples and implementation strategies.