import { prisma } from '../config/database';
import { Invoice, Customer, Person, Business, Payment } from '@prisma/client';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';
import Decimal from 'decimal.js';
import { PaymentStatus, PaymentMethod, AuditAction } from '../types/enums';

/**
 * E-Transfer data for matching
 */
export interface ETransferMatchData {
  senderName: string;
  senderEmail: string;
  amount: number;
  referenceNumber: string;
  transferDate: Date;
  messageId: string;
}

/**
 * Match result with confidence level
 */
export interface MatchResult {
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  score: number;
  invoice?: Invoice & { customer: Customer & { person?: Person | null; business?: Business | null } };
  matches: Array<{
    invoice: Invoice & { customer: Customer & { person?: Person | null; business?: Business | null } };
    score: number;
    reasons: string[];
  }>;
  requiresReview: boolean;
}

/**
 * Scored invoice match
 */
interface ScoredMatch {
  invoice: Invoice & { customer: Customer & { person?: Person | null; business?: Business | null } };
  score: number;
  reasons: string[];
}

/**
 * E-Transfer Auto-Matching Service
 * Automatically matches incoming e-Transfers to invoices with high accuracy
 */
export class ETransferAutoMatchService {
  // Confidence thresholds (0-100 scale)
  private readonly HIGH_CONFIDENCE = 90;
  private readonly MEDIUM_CONFIDENCE = 70;
  private readonly AUTO_MATCH_THRESHOLD = 85; // Only auto-apply matches above this
  private readonly HIGH_VALUE_THRESHOLD = 5000; // Manual review required for high values

  /**
   * Attempt to auto-match e-Transfer to invoice
   * Returns match result with confidence level and potential matches
   */
  async matchTransfer(
    organizationId: string,
    transferData: ETransferMatchData
  ): Promise<MatchResult> {
    logger.info('Attempting e-Transfer auto-match', {
      organizationId,
      amount: transferData.amount,
      sender: transferData.senderName,
      reference: transferData.referenceNumber
    });

    // Step 1: Check for duplicate transfers (prevent double-entry)
    const duplicate = await this.checkDuplicate(organizationId, transferData);
    if (duplicate) {
      logger.warn('Duplicate e-Transfer detected', {
        messageId: transferData.messageId,
        existingPaymentId: duplicate.id
      });
      return {
        confidence: 'NONE',
        score: 0,
        matches: [],
        requiresReview: true
      };
    }

    // Step 2: Find potential invoice matches
    const potentialMatches = await this.findPotentialMatches(
      organizationId,
      transferData
    );

    if (potentialMatches.length === 0) {
      logger.info('No potential invoice matches found', {
        amount: transferData.amount,
        sender: transferData.senderName
      });
      return {
        confidence: 'NONE',
        score: 0,
        matches: [],
        requiresReview: true
      };
    }

    // Step 3: Score each potential match
    const scoredMatches = await Promise.all(
      potentialMatches.map(invoice => this.scoreMatch(invoice, transferData))
    );

    // Step 4: Sort by score (highest first)
    scoredMatches.sort((a, b) => b.score - a.score);

    const bestMatch = scoredMatches[0];
    const confidence = this.getConfidenceLevel(bestMatch.score);

    // Step 5: Determine if manual review is required
    const requiresReview = this.shouldRequireReview(
      bestMatch.score,
      transferData.amount,
      scoredMatches
    );

    logger.info('Auto-match completed', {
      confidence,
      score: bestMatch.score,
      requiresReview,
      bestMatchInvoice: bestMatch.invoice.invoiceNumber,
      totalMatches: scoredMatches.length
    });

    return {
      confidence,
      score: bestMatch.score,
      invoice: bestMatch.invoice,
      matches: scoredMatches,
      requiresReview
    };
  }

  /**
   * Create payment record from matched transfer
   */
  async createPaymentFromMatch(
    organizationId: string,
    invoiceId: string,
    transferData: ETransferMatchData,
    matchScore: number,
    userId?: string
  ): Promise<Payment> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true }
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Calculate payment details
    const paymentAmount = new Decimal(transferData.amount);
    const referenceNumber = transferData.referenceNumber ||
      `ETRANS-${transferData.messageId.substring(0, 15)}`;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        organizationId,
        paymentNumber: `PAY-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        customerId: invoice.customerId,
        invoiceId,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        amount: paymentAmount.toNumber(),
        currency: transferData.amount >= 0 ? 'CAD' : invoice.currency,
        paymentDate: transferData.transferDate,
        referenceNumber,
        status: PaymentStatus.COMPLETED,
        processedAt: new Date(),
        adminNotes: `Auto-matched e-Transfer (${matchScore}% confidence)\nSender: ${transferData.senderName}\nEmail: ${transferData.senderEmail}`,
        metadata: JSON.stringify({
          autoMatched: true,
          matchScore,
          messageId: transferData.messageId,
          senderEmail: transferData.senderEmail,
          senderName: transferData.senderName,
          originalReference: transferData.referenceNumber
        }),
        createdBy: userId
      }
    });

    // Update invoice balance
    const currentBalance = invoice.balance instanceof Decimal
      ? invoice.balance
      : new Decimal(invoice.balance);
    const newBalance = currentBalance.minus(paymentAmount);

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        balance: newBalance.toNumber(),
        status: newBalance.lessThanOrEqualTo(0) ? 'PAID' : invoice.status
      }
    });

    // Create audit log
    await auditService.logAction({
      action: AuditAction.CREATE,
      entityType: 'Payment',
      entityId: payment.id,
      changes: {
        amount: { after: transferData.amount },
        autoMatched: { after: true },
        matchScore: { after: matchScore },
        invoiceId: { after: invoiceId }
      },
      context: {
        organizationId,
        userId: userId || 'system',
        ipAddress: 'etransfer-auto-match',
        userAgent: 'etransfer-automation-system'
      }
    });

    logger.info('Payment created from auto-matched e-Transfer', {
      paymentId: payment.id,
      invoiceId,
      amount: transferData.amount,
      matchScore,
      confidence: this.getConfidenceLevel(matchScore)
    });

    return payment;
  }

  /**
   * Create pending review payment record
   */
  async createPendingReviewPayment(
    organizationId: string,
    transferData: ETransferMatchData,
    potentialMatches: ScoredMatch[],
    userId?: string
  ): Promise<Payment> {
    // Use top match as suggestion, but mark for review
    const topMatch = potentialMatches[0];

    const payment = await prisma.payment.create({
      data: {
        organizationId,
        paymentNumber: `PAY-REVIEW-${Date.now()}`,
        customerId: topMatch?.invoice.customerId || '',
        invoiceId: topMatch?.invoice.id,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        amount: transferData.amount,
        currency: 'CAD',
        paymentDate: transferData.transferDate,
        referenceNumber: transferData.referenceNumber || transferData.messageId,
        status: PaymentStatus.PENDING_REVIEW,
        adminNotes: `Requires manual review\nSender: ${transferData.senderName}\nPotential matches: ${potentialMatches.length}`,
        metadata: JSON.stringify({
          requiresReview: true,
          messageId: transferData.messageId,
          senderEmail: transferData.senderEmail,
          senderName: transferData.senderName,
          potentialMatches: potentialMatches.slice(0, 5).map(m => ({
            invoiceId: m.invoice.id,
            invoiceNumber: m.invoice.invoiceNumber,
            score: m.score,
            reasons: m.reasons
          }))
        }),
        createdBy: userId
      }
    });

    logger.info('Pending review payment created', {
      paymentId: payment.id,
      potentialMatches: potentialMatches.length
    });

    return payment;
  }

  /**
   * Find potential invoice matches based on amount, date, customer
   */
  private async findPotentialMatches(
    organizationId: string,
    transferData: ETransferMatchData
  ): Promise<Array<Invoice & { customer: Customer & { person?: Person | null; business?: Business | null } }>> {
    const amountDecimal = new Decimal(transferData.amount);
    const dateWindow = new Date(transferData.transferDate);
    dateWindow.setDate(dateWindow.getDate() - 30); // Look back 30 days

    // Find invoices with matching or close amounts
    const invoices = await prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] },
        balance: { gt: 0 },
        createdAt: { gte: dateWindow },
        OR: [
          // Exact amount match
          { balance: amountDecimal.toNumber() },
          // Amount within $1 (for rounding/fees)
          {
            balance: {
              gte: amountDecimal.minus(1).toNumber(),
              lte: amountDecimal.plus(1).toNumber()
            }
          },
          // Amount within 2% (for partial payments)
          {
            balance: {
              gte: amountDecimal.times(0.98).toNumber(),
              lte: amountDecimal.times(1.02).toNumber()
            }
          }
        ]
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        }
      },
      take: 20,
      orderBy: {
        createdAt: 'desc'
      }
    });

    return invoices;
  }

  /**
   * Score a potential invoice match (0-100 scale)
   */
  private async scoreMatch(
    invoice: Invoice & { customer: Customer & { person?: Person | null; business?: Business | null } },
    transferData: ETransferMatchData
  ): Promise<ScoredMatch> {
    let score = 0;
    const reasons: string[] = [];

    // 1. REFERENCE NUMBER MATCH (50 points if exact match)
    if (transferData.referenceNumber) {
      const ref = transferData.referenceNumber.toLowerCase();
      const invoiceNum = invoice.invoiceNumber.toLowerCase();

      if (ref.includes(invoiceNum) || invoiceNum.includes(ref)) {
        score += 50;
        reasons.push('Reference contains invoice number');
      } else if (ref.replace(/\s/g, '').includes(invoiceNum.replace(/\s/g, ''))) {
        score += 40;
        reasons.push('Reference matches invoice (without spaces)');
      }
    }

    // 2. AMOUNT MATCH (40 points for exact, 30 for close)
    const amountDiff = Math.abs(
      new Decimal(transferData.amount).minus(invoice.balance).toNumber()
    );

    if (amountDiff === 0) {
      score += 40;
      reasons.push('Exact amount match');
    } else if (amountDiff <= 0.01) {
      score += 38;
      reasons.push('Amount match (penny difference)');
    } else if (amountDiff <= 1) {
      score += 30;
      reasons.push('Amount match within $1');
    } else if (amountDiff <= 10) {
      score += 15;
      reasons.push('Amount close match (within $10)');
    } else {
      const percentDiff = (amountDiff / new Decimal(invoice.balance).toNumber()) * 100;
      if (percentDiff <= 2) {
        score += 20;
        reasons.push('Amount within 2%');
      }
    }

    // 3. CUSTOMER NAME MATCH (30 points)
    const customerName = invoice.customer.person
      ? `${invoice.customer.person.firstName} ${invoice.customer.person.lastName}`
      : invoice.customer.business?.legalName || '';

    const nameSimilarity = this.calculateStringSimilarity(
      transferData.senderName.toLowerCase(),
      customerName.toLowerCase()
    );

    if (nameSimilarity > 0.9) {
      score += 30;
      reasons.push(`Customer name match (${Math.round(nameSimilarity * 100)}%)`);
    } else if (nameSimilarity > 0.7) {
      score += 20;
      reasons.push(`Strong name similarity (${Math.round(nameSimilarity * 100)}%)`);
    } else if (nameSimilarity > 0.5) {
      score += 10;
      reasons.push('Partial name match');
    }

    // 4. EMAIL MATCH (20 points)
    const customerEmail = invoice.customer.person?.email ||
      invoice.customer.business?.email || '';

    if (customerEmail && transferData.senderEmail.toLowerCase() === customerEmail.toLowerCase()) {
      score += 20;
      reasons.push('Email address exact match');
    } else if (customerEmail && this.emailDomainsMatch(transferData.senderEmail, customerEmail)) {
      score += 10;
      reasons.push('Email domain match');
    }

    // 5. RECENT INVOICE BONUS (10 points if within 7 days)
    const daysSince = Math.floor(
      (transferData.transferDate.getTime() - invoice.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince >= 0 && daysSince <= 7) {
      score += 10;
      reasons.push('Recent invoice (within 7 days)');
    } else if (daysSince >= 0 && daysSince <= 14) {
      score += 5;
      reasons.push('Invoice within 14 days');
    }

    return { invoice, score, reasons };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * Returns value between 0 (no similarity) and 1 (identical)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Empty string check
    if (len1 === 0 || len2 === 0) {
      return len1 === len2 ? 1 : 0;
    }

    // Create matrix
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first column and row
    for (let i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill in the matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    const distance = matrix[len1][len2];
    return 1 - (distance / maxLen);
  }

  /**
   * Check if email domains match
   */
  private emailDomainsMatch(email1: string, email2: string): boolean {
    const domain1 = email1.split('@')[1]?.toLowerCase();
    const domain2 = email2.split('@')[1]?.toLowerCase();
    return !!domain1 && !!domain2 && domain1 === domain2;
  }

  /**
   * Check for duplicate transfer (prevent double-entry)
   */
  private async checkDuplicate(
    organizationId: string,
    transferData: ETransferMatchData
  ): Promise<Payment | null> {
    // Check for same amount, date, and sender within 1 minute window
    const timeWindow = 60000; // 1 minute
    const startTime = new Date(transferData.transferDate.getTime() - timeWindow);
    const endTime = new Date(transferData.transferDate.getTime() + timeWindow);

    const existing = await prisma.payment.findFirst({
      where: {
        organizationId,
        paymentMethod: PaymentMethod.INTERAC_ETRANSFER,
        amount: new Decimal(transferData.amount).toNumber(),
        paymentDate: {
          gte: startTime,
          lte: endTime
        },
        metadata: {
          contains: transferData.messageId
        }
      }
    });

    return existing;
  }

  /**
   * Get confidence level from score
   */
  private getConfidenceLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
    if (score >= this.HIGH_CONFIDENCE) return 'HIGH';
    if (score >= this.MEDIUM_CONFIDENCE) return 'MEDIUM';
    if (score > 0) return 'LOW';
    return 'NONE';
  }

  /**
   * Determine if manual review is required
   */
  private shouldRequireReview(
    topScore: number,
    amount: number,
    matches: ScoredMatch[]
  ): boolean {
    // Require review if confidence is below threshold
    if (topScore < this.AUTO_MATCH_THRESHOLD) {
      return true;
    }

    // Require review for high-value transfers
    if (amount > this.HIGH_VALUE_THRESHOLD) {
      return true;
    }

    // Require review if there are multiple high-confidence matches
    const highConfidenceMatches = matches.filter(
      m => m.score >= this.MEDIUM_CONFIDENCE
    );
    if (highConfidenceMatches.length > 1) {
      const scoreDiff = matches[0].score - matches[1].score;
      // If top 2 matches are within 10 points, require review
      if (scoreDiff < 10) {
        return true;
      }
    }

    return false;
  }
}

export const eTransferAutoMatchService = new ETransferAutoMatchService();
