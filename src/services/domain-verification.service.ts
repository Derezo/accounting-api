import { promises as dns } from 'dns';
import * as crypto from 'crypto';
import { prisma } from '../config/database';
import { config } from '../config/config';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errors';
import { auditService } from './audit.service';

export interface DomainVerificationResult {
  verified: boolean;
  recordFound: boolean;
  expectedValue: string;
  actualValue?: string;
  timestamp: Date;
  nameservers?: string[];
}

export interface DomainVerificationRequest {
  domain: string;
  verificationToken: string;
  cnameRecord: string;
  instructions: string;
  expiresAt: Date;
  status: string;
}

export class DomainVerificationService {
  /**
   * Reserved domains that cannot be registered
   */
  private readonly RESERVED_DOMAINS = [
    'localhost',
    'lifestreamdynamics.com',
    'test.com',
    'example.com',
    'example.org',
    'example.net',
    'google.com',
    'microsoft.com',
    'apple.com',
    'amazon.com',
    'facebook.com',
    'twitter.com'
  ];

  /**
   * DNS resolvers to use for verification (multiple for redundancy)
   */
  private readonly DNS_RESOLVERS = [
    '8.8.8.8',        // Google
    '8.8.4.4',        // Google
    '1.1.1.1',        // Cloudflare
    '1.0.0.1',        // Cloudflare
    '9.9.9.9',        // Quad9
  ];

  /**
   * Generate a cryptographically secure verification token
   */
  generateVerificationToken(domain: string): string {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(16).toString('hex');
    const input = `${domain}:${timestamp}:${random}:${config.ENCRYPTION_KEY}`;

    const hash = crypto
      .createHash('sha256')
      .update(input)
      .digest('hex')
      .substring(0, 32);

    return `accounting-verify-${hash}`;
  }

  /**
   * Validate domain format using RFC standards
   */
  validateDomainFormat(domain: string): void {
    // RFC 1035/1123 compliant domain validation
    const domainRegex = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z]{2,})+$/;

    if (!domain || typeof domain !== 'string') {
      throw new ValidationError('Domain must be a non-empty string');
    }

    if (domain.length > 253) {
      throw new ValidationError('Domain exceeds maximum length of 253 characters');
    }

    if (!domainRegex.test(domain)) {
      throw new ValidationError(
        'Invalid domain format. Must be a valid domain name (e.g., example.com)'
      );
    }

    // Check for invalid characters
    if (domain.includes('..')) {
      throw new ValidationError('Domain cannot contain consecutive dots');
    }

    // Check each label (part between dots)
    const labels = domain.split('.');
    for (const label of labels) {
      if (label.length > 63) {
        throw new ValidationError('Domain label exceeds maximum length of 63 characters');
      }
      if (label.startsWith('-') || label.endsWith('-')) {
        throw new ValidationError('Domain labels cannot start or end with hyphens');
      }
    }
  }

  /**
   * Check if domain is reserved
   */
  isReservedDomain(domain: string): boolean {
    const normalizedDomain = domain.toLowerCase();
    return this.RESERVED_DOMAINS.some(reserved =>
      normalizedDomain === reserved || normalizedDomain.endsWith(`.${reserved}`)
    );
  }

  /**
   * Validate domain availability and format
   */
  async validateDomain(domain: string): Promise<void> {
    // Normalize domain
    const normalizedDomain = domain.toLowerCase().trim();

    // Check format
    this.validateDomainFormat(normalizedDomain);

    // Check if reserved
    if (this.isReservedDomain(normalizedDomain)) {
      throw new ValidationError(`Domain ${domain} is reserved and cannot be registered`);
    }

    // Check if already registered
    const existing = await prisma.organization.findUnique({
      where: { domain: normalizedDomain },
      select: {
        id: true,
        name: true,
        isActive: true,
        deletedAt: true
      }
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictError(
        `Domain ${domain} is already registered to organization "${existing.name}"`
      );
    }
  }

  /**
   * Verify CNAME record using multiple DNS resolvers
   */
  async verifyCNAME(
    domain: string,
    verificationToken: string
  ): Promise<DomainVerificationResult> {
    const recordName = `_accounting-verify.${domain}`;
    const expectedValue = `${verificationToken}.verify.lifestreamdynamics.com`;

    const results: DomainVerificationResult[] = [];

    // Try multiple DNS resolvers for redundancy
    for (const resolver of this.DNS_RESOLVERS.slice(0, 3)) {
      try {
        // Configure resolver
        const customResolver = new dns.Resolver();
        customResolver.setServers([resolver]);

        // Look up CNAME record
        const records = await customResolver.resolveCname(recordName);

        const verified = records.some(
          record => record.toLowerCase() === expectedValue.toLowerCase()
        );

        results.push({
          verified,
          recordFound: records.length > 0,
          expectedValue,
          actualValue: records[0],
          timestamp: new Date(),
          nameservers: [resolver]
        });

        // If verified by at least one resolver, return success
        if (verified) {
          return results[results.length - 1];
        }
      } catch (error: any) {
        // DNS lookup failed for this resolver, try next one
        results.push({
          verified: false,
          recordFound: false,
          expectedValue,
          timestamp: new Date(),
          nameservers: [resolver]
        });
      }
    }

    // No resolver could verify, return last result
    return results[results.length - 1] || {
      verified: false,
      recordFound: false,
      expectedValue,
      timestamp: new Date()
    };
  }

  /**
   * Request domain verification (step 1 of 2)
   */
  async requestDomainVerification(
    domain: string,
    requestedBy: string,
    organizationId: string
  ): Promise<DomainVerificationRequest> {
    // Validate domain
    await this.validateDomain(domain);

    const normalizedDomain = domain.toLowerCase().trim();

    // Generate verification token
    const verificationToken = this.generateVerificationToken(normalizedDomain);
    const cnameRecord = `_accounting-verify.${normalizedDomain} CNAME ${verificationToken}.verify.lifestreamdynamics.com`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Check for existing verification request
    const existing = await prisma.$queryRaw<any[]>`
      SELECT * FROM DomainVerification
      WHERE domain = ${normalizedDomain}
      AND status IN ('PENDING', 'VERIFIED')
      AND expiresAt > ${new Date()}
      LIMIT 1
    `.catch(() => []); // Handle if table doesn't exist yet

    if (existing && existing.length > 0) {
      // Return existing request if still valid
      const existingRequest = existing[0];
      return {
        domain: normalizedDomain,
        verificationToken: existingRequest.verificationToken,
        cnameRecord: `_accounting-verify.${normalizedDomain} CNAME ${existingRequest.verificationToken}.verify.lifestreamdynamics.com`,
        instructions: this.getVerificationInstructions(normalizedDomain, existingRequest.verificationToken),
        expiresAt: new Date(existingRequest.expiresAt),
        status: existingRequest.status
      };
    }

    // Create new verification request (if table exists)
    try {
      await prisma.$executeRaw`
        INSERT INTO DomainVerification (
          id, domain, verificationToken, status, attempts, expiresAt, createdAt, updatedAt
        ) VALUES (
          ${this.generateId()},
          ${normalizedDomain},
          ${verificationToken},
          'PENDING',
          0,
          ${expiresAt},
          ${new Date()},
          ${new Date()}
        )
      `;
    } catch (error) {
      // Table might not exist yet, that's okay for now
      console.warn('DomainVerification table not available:', error);
    }

    // Create audit log
    await auditService.logAction({
      organizationId,
      userId: requestedBy,
      action: 'DOMAIN_VERIFICATION_REQUESTED',
      entity: 'DomainVerification',
      entityId: normalizedDomain,
      changes: {
        domain: normalizedDomain,
        verificationToken,
        expiresAt: expiresAt.toISOString()
      },
      ipAddress: '0.0.0.0',
      userAgent: 'API'
    });

    return {
      domain: normalizedDomain,
      verificationToken,
      cnameRecord,
      instructions: this.getVerificationInstructions(normalizedDomain, verificationToken),
      expiresAt,
      status: 'PENDING'
    };
  }

  /**
   * Verify domain ownership (step 2 of 2)
   */
  async verifyDomain(
    domain: string,
    verifiedBy: string,
    organizationId: string
  ): Promise<DomainVerificationResult> {
    const normalizedDomain = domain.toLowerCase().trim();

    // Get verification request
    let verificationRequest: any;
    try {
      const results = await prisma.$queryRaw<any[]>`
        SELECT * FROM DomainVerification
        WHERE domain = ${normalizedDomain}
        AND status = 'PENDING'
        AND expiresAt > ${new Date()}
        ORDER BY createdAt DESC
        LIMIT 1
      `;
      verificationRequest = results[0];
    } catch (error) {
      // Table doesn't exist yet
      throw new NotFoundError(`No verification request found for domain ${domain}`);
    }

    if (!verificationRequest) {
      throw new NotFoundError(
        `No pending verification request found for domain ${domain}. Please request verification first.`
      );
    }

    // Check if expired
    if (new Date(verificationRequest.expiresAt) < new Date()) {
      await this.updateVerificationStatus(normalizedDomain, 'EXPIRED');
      throw new ValidationError(
        `Verification request for ${domain} has expired. Please request a new verification.`
      );
    }

    // Perform DNS verification
    const result = await this.verifyCNAME(normalizedDomain, verificationRequest.verificationToken);

    // Update verification status
    if (result.verified) {
      await this.updateVerificationStatus(normalizedDomain, 'VERIFIED');

      // Create audit log
      await auditService.logAction({
        organizationId,
        userId: verifiedBy,
        action: 'DOMAIN_VERIFIED',
        entity: 'DomainVerification',
        entityId: normalizedDomain,
        changes: {
          domain: normalizedDomain,
          verified: true,
          timestamp: result.timestamp.toISOString()
        },
        ipAddress: '0.0.0.0',
        userAgent: 'API'
      });
    } else {
      // Increment attempt counter
      await this.incrementVerificationAttempts(normalizedDomain);
    }

    return result;
  }

  /**
   * Get verification status for a domain
   */
  async getVerificationStatus(domain: string): Promise<any> {
    const normalizedDomain = domain.toLowerCase().trim();

    try {
      const results = await prisma.$queryRaw<any[]>`
        SELECT * FROM DomainVerification
        WHERE domain = ${normalizedDomain}
        ORDER BY createdAt DESC
        LIMIT 1
      `;

      if (!results || results.length === 0) {
        throw new NotFoundError(`No verification request found for domain ${domain}`);
      }

      return results[0];
    } catch (error) {
      throw new NotFoundError(`No verification request found for domain ${domain}`);
    }
  }

  /**
   * Helper: Update verification status
   */
  private async updateVerificationStatus(domain: string, status: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE DomainVerification
        SET status = ${status},
            verifiedAt = ${status === 'VERIFIED' ? new Date() : null},
            lastAttemptAt = ${new Date()},
            updatedAt = ${new Date()}
        WHERE domain = ${domain}
      `;
    } catch (error) {
      console.warn('Could not update verification status:', error);
    }
  }

  /**
   * Helper: Increment verification attempt counter
   */
  private async incrementVerificationAttempts(domain: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE DomainVerification
        SET attempts = attempts + 1,
            lastAttemptAt = ${new Date()},
            updatedAt = ${new Date()}
        WHERE domain = ${domain}
      `;
    } catch (error) {
      console.warn('Could not increment verification attempts:', error);
    }
  }

  /**
   * Helper: Generate CUID-like ID
   */
  private generateId(): string {
    return `dv_${crypto.randomBytes(12).toString('hex')}`;
  }

  /**
   * Helper: Get verification instructions
   */
  private getVerificationInstructions(domain: string, token: string): string {
    return `
To verify ownership of ${domain}, add the following DNS CNAME record:

Record Type: CNAME
Host/Name: _accounting-verify.${domain}
Value/Target: ${token}.verify.lifestreamdynamics.com
TTL: 3600 (or default)

DNS propagation may take up to 24 hours. This verification will expire in 24 hours.

After adding the record, use the verification endpoint to check status:
GET /api/v1/organizations/verify-domain/${domain}

For help, contact support@lifestreamdynamics.com
    `.trim();
  }
}

export const domainVerificationService = new DomainVerificationService();