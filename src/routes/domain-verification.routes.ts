import { Router, Response } from 'express';
import { requireMasterOrgSuperAdmin } from '../middleware/master-org.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { domainVerificationService } from '../services/domain-verification.service';
import { AuthenticatedRequest } from '../types/express.d';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const audit = auditMiddleware('DomainVerification');

// All routes require authentication and master org super admin
router.use(authenticate as any);
router.use(requireMasterOrgSuperAdmin as any);

/**
 * @swagger
 * /organizations/verify-domain:
 *   post:
 *     tags: [Organizations, Domain Verification]
 *     summary: Request domain ownership verification
 *     description: |
 *       Initiates the domain verification process for a new organization.
 *       Generates a unique CNAME record that must be added to the domain's DNS.
 *
 *       **Master Organization Only**: This endpoint requires SUPER_ADMIN role from lifestreamdynamics.com
 *
 *       **Verification Process**:
 *       1. Submit domain for verification
 *       2. Receive CNAME record to add to DNS
 *       3. Add record: `_accounting-verify.domain.com CNAME token.verify.lifestreamdynamics.com`
 *       4. Wait for DNS propagation (may take up to 24 hours)
 *       5. Call verification endpoint to confirm
 *
 *       **Security**: Prevents unauthorized organizations from claiming domains they don't own
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *             properties:
 *               domain:
 *                 type: string
 *                 description: Domain name to verify (without www or protocol)
 *                 example: "newclient.com"
 *                 pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\\.[a-zA-Z]{2,}$"
 *     responses:
 *       200:
 *         description: Verification request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 domain:
 *                   type: string
 *                   example: "newclient.com"
 *                 verificationToken:
 *                   type: string
 *                   example: "accounting-verify-abc123def456"
 *                 cnameRecord:
 *                   type: string
 *                   example: "_accounting-verify.newclient.com CNAME accounting-verify-abc123def456.verify.lifestreamdynamics.com"
 *                 instructions:
 *                   type: string
 *                   description: Step-by-step instructions for adding DNS record
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: Verification token expires after 24 hours
 *                 status:
 *                   type: string
 *                   enum: [PENDING, VERIFIED, FAILED, EXPIRED]
 *                   example: "PENDING"
 *       400:
 *         description: Invalid domain format or reserved domain
 *       403:
 *         description: Forbidden - Requires SUPER_ADMIN from master organization
 *       409:
 *         description: Domain already registered to another organization
 *       500:
 *         description: Internal server error
 */
router.post(
  '/verify-domain',
  audit.create,
  async (req: any, res: Response): Promise<void> => {
    const { domain } = req.body;

    const result = await domainVerificationService.requestDomainVerification(
      domain,
      req.user.id,
      req.user.organizationId
    );

    res.status(200).json(result);
  }
);

/**
 * @swagger
 * /organizations/verify-domain/{domain}:
 *   get:
 *     tags: [Organizations, Domain Verification]
 *     summary: Check domain verification status
 *     description: |
 *       Retrieves the current verification status for a domain.
 *       Use this to check if the DNS CNAME record has been added and verified.
 *
 *       **Master Organization Only**: This endpoint requires SUPER_ADMIN role from lifestreamdynamics.com
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         description: Domain name to check
 *         schema:
 *           type: string
 *           example: "newclient.com"
 *     responses:
 *       200:
 *         description: Verification status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 domain:
 *                   type: string
 *                   example: "newclient.com"
 *                 status:
 *                   type: string
 *                   enum: [PENDING, VERIFIED, FAILED, EXPIRED]
 *                   example: "VERIFIED"
 *                 verificationToken:
 *                   type: string
 *                   example: "accounting-verify-abc123def456"
 *                 attempts:
 *                   type: integer
 *                   description: Number of verification attempts
 *                 lastAttemptAt:
 *                   type: string
 *                   format: date-time
 *                 verifiedAt:
 *                   type: string
 *                   format: date-time
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Forbidden - Requires SUPER_ADMIN from master organization
 *       404:
 *         description: No verification request found for this domain
 *       500:
 *         description: Internal server error
 */
router.get(
  '/verify-domain/:domain',
  audit.view,
  async (req: any, res: Response): Promise<void> => {
    const { domain } = req.params;

    const status = await domainVerificationService.getVerificationStatus(domain);

    res.status(200).json(status);
  }
);

/**
 * @swagger
 * /organizations/verify-domain/{domain}/verify:
 *   post:
 *     tags: [Organizations, Domain Verification]
 *     summary: Verify domain ownership via DNS
 *     description: |
 *       Performs DNS lookup to verify the CNAME record has been added correctly.
 *       Uses multiple DNS resolvers (Google, Cloudflare, Quad9) for redundancy.
 *
 *       **Master Organization Only**: This endpoint requires SUPER_ADMIN role from lifestreamdynamics.com
 *
 *       **What it checks**:
 *       - DNS CNAME record exists at `_accounting-verify.domain.com`
 *       - Record value matches the expected verification token
 *       - Uses multiple DNS servers to prevent spoofing
 *       - Verification token has not expired
 *
 *       **After verification**:
 *       - Domain status changes to VERIFIED
 *       - Domain can be used to create new organization
 *       - Audit log entry created
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         description: Domain name to verify
 *         schema:
 *           type: string
 *           example: "newclient.com"
 *     responses:
 *       200:
 *         description: Verification completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified:
 *                   type: boolean
 *                   example: true
 *                   description: Whether domain was successfully verified
 *                 recordFound:
 *                   type: boolean
 *                   example: true
 *                   description: Whether DNS record was found
 *                 expectedValue:
 *                   type: string
 *                   example: "accounting-verify-abc123def456.verify.lifestreamdynamics.com"
 *                   description: Expected CNAME target
 *                 actualValue:
 *                   type: string
 *                   example: "accounting-verify-abc123def456.verify.lifestreamdynamics.com"
 *                   description: Actual CNAME value found in DNS
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: When verification was performed
 *                 nameservers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: DNS resolvers used for verification
 *                   example: ["8.8.8.8", "1.1.1.1"]
 *       400:
 *         description: Verification token expired
 *       403:
 *         description: Forbidden - Requires SUPER_ADMIN from master organization
 *       404:
 *         description: No pending verification request found
 *       422:
 *         description: DNS record not found or incorrect value
 *       500:
 *         description: Internal server error
 */
router.post(
  '/verify-domain/:domain/verify',
  audit.update,
  async (req: any, res: Response): Promise<void> => {
    const { domain } = req.params;

    const result = await domainVerificationService.verifyDomain(
      domain,
      req.user.id,
      req.user.organizationId
    );

    if (result.verified) {
      res.status(200).json({
        ...result,
        message: 'Domain verified successfully. You can now create an organization with this domain.'
      });
    } else {
      res.status(422).json({
        ...result,
        message: 'Domain verification failed. Please ensure the DNS CNAME record is correctly configured.',
        troubleshooting: {
          steps: [
            'Verify the CNAME record was added correctly',
            'Check DNS propagation (may take up to 24 hours)',
            'Ensure record name is: _accounting-verify.' + domain,
            'Ensure record target is: ' + result.expectedValue,
            'Try using a DNS checker tool (e.g., dnschecker.org)',
            'Contact your DNS provider if issues persist'
          ]
        }
      });
    }
  }
);

export default router;