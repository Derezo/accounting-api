import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { uploadSingle, uploadMultiple } from '../middleware/upload.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { validateDocumentUpload, validateDocumentUpdate, validateDocumentFilters, validateBulkUpload } from '../validators/document.validator';
import { UserRole } from '../types/enums';

const router = Router();
const documentController = new DocumentController();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Upload a new document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload
 *               title:
 *                 type: string
 *                 description: Document title
 *               description:
 *                 type: string
 *                 description: Document description
 *               category:
 *                 type: string
 *                 enum: [INVOICE, RECEIPT, CONTRACT, QUOTE, TAX_DOCUMENT, PROOF_OF_PAYMENT, IDENTIFICATION, INSURANCE, LEGAL, COMPLIANCE, FINANCIAL_STATEMENT, OTHER]
 *                 description: Document category
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document tags
 *               entityType:
 *                 type: string
 *                 description: Entity type the document is attached to
 *               entityId:
 *                 type: string
 *                 description: Entity ID the document is attached to
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the document is public
 *               isEncrypted:
 *                 type: boolean
 *                 description: Whether the document should be encrypted
 *               accessLevel:
 *                 type: string
 *                 enum: [PUBLIC, PRIVATE, RESTRICTED]
 *                 description: Document access level
 *               retentionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Document retention date
 *             required:
 *               - file
 *               - category
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       413:
 *         description: File too large
 */
router.post(
  '/',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE]),
  uploadSingle('file'),
  validateDocumentUpload,
  auditMiddleware('Document').create,
  documentController.uploadDocument.bind(documentController)
);

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: Get list of documents
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [INVOICE, RECEIPT, CONTRACT, QUOTE, TAX_DOCUMENT, PROOF_OF_PAYMENT, IDENTIFICATION, INSURANCE, LEGAL, COMPLIANCE, FINANCIAL_STATEMENT, OTHER]
 *         description: Filter by document category
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter by entity type
 *       - in: query
 *         name: entityId
 *         schema:
 *           type: string
 *         description: Filter by entity ID
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Filter by tags
 *       - in: query
 *         name: isPublic
 *         schema:
 *           type: boolean
 *         description: Filter by public status
 *       - in: query
 *         name: accessLevel
 *         schema:
 *           type: string
 *           enum: [PUBLIC, PRIVATE, RESTRICTED]
 *         description: Filter by access level
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, description, and filename
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter documents created after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter documents created before this date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of documents to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of documents to skip
 *     responses:
 *       200:
 *         description: List of documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 *                 total:
 *                   type: integer
 *                   description: Total number of documents
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER]),
  validateDocumentFilters,
  documentController.listDocuments.bind(documentController)
);

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a specific document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 */
router.get(
  '/:id',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER]),
  auditMiddleware('Document').view,
  documentController.getDocument.bind(documentController)
);

/**
 * @swagger
 * /documents/{id}/download:
 *   get:
 *     summary: Download a document file
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document file
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 */
router.get(
  '/:id/download',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER]),
  auditMiddleware('Document').view,
  documentController.downloadDocument.bind(documentController)
);

/**
 * @swagger
 * /documents/{id}:
 *   put:
 *     summary: Update a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Document title
 *               description:
 *                 type: string
 *                 description: Document description
 *               category:
 *                 type: string
 *                 enum: [INVOICE, RECEIPT, CONTRACT, QUOTE, TAX_DOCUMENT, PROOF_OF_PAYMENT, IDENTIFICATION, INSURANCE, LEGAL, COMPLIANCE, FINANCIAL_STATEMENT, OTHER]
 *                 description: Document category
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document tags
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the document is public
 *               accessLevel:
 *                 type: string
 *                 enum: [PUBLIC, PRIVATE, RESTRICTED]
 *                 description: Document access level
 *               retentionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Document retention date
 *     responses:
 *       200:
 *         description: Document updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 */
router.put(
  '/:id',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT]),
  validateDocumentUpdate,
  auditMiddleware('Document').update,
  documentController.updateDocument.bind(documentController)
);

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *       - in: query
 *         name: permanent
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to permanently delete the document
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 */
router.delete(
  '/:id',
  authorize([UserRole.ADMIN, UserRole.MANAGER]),
  auditMiddleware('Document').delete,
  documentController.deleteDocument.bind(documentController)
);

/**
 * @swagger
 * /documents/{id}/versions:
 *   post:
 *     summary: Create a new version of a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Parent document ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The new version file
 *               title:
 *                 type: string
 *                 description: Document title
 *               description:
 *                 type: string
 *                 description: Document description
 *               category:
 *                 type: string
 *                 enum: [INVOICE, RECEIPT, CONTRACT, QUOTE, TAX_DOCUMENT, PROOF_OF_PAYMENT, IDENTIFICATION, INSURANCE, LEGAL, COMPLIANCE, FINANCIAL_STATEMENT, OTHER]
 *                 description: Document category
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document tags
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the document is public
 *               isEncrypted:
 *                 type: boolean
 *                 description: Whether the document should be encrypted
 *               accessLevel:
 *                 type: string
 *                 enum: [PUBLIC, PRIVATE, RESTRICTED]
 *                 description: Document access level
 *               retentionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Document retention date
 *             required:
 *               - file
 *     responses:
 *       201:
 *         description: Document version created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Parent document not found
 */
router.post(
  '/:id/versions',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT]),
  uploadSingle('file'),
  validateDocumentUpload,
  auditMiddleware('Document').create,
  documentController.createVersion.bind(documentController)
);

/**
 * @swagger
 * /documents/{id}/versions:
 *   get:
 *     summary: Get all versions of a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: List of document versions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 */
router.get(
  '/:id/versions',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER]),
  documentController.getVersions.bind(documentController)
);

/**
 * @swagger
 * /documents/{id}/attach:
 *   post:
 *     summary: Attach a document to an entity
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entityType:
 *                 type: string
 *                 description: Entity type to attach to
 *               entityId:
 *                 type: string
 *                 description: Entity ID to attach to
 *             required:
 *               - entityType
 *               - entityId
 *     responses:
 *       200:
 *         description: Document attached successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 */
router.post(
  '/:id/attach',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT]),
  auditMiddleware('Document').update,
  documentController.attachToEntity.bind(documentController)
);

/**
 * @swagger
 * /documents/stats:
 *   get:
 *     summary: Get document statistics
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter stats by entity type
 *       - in: query
 *         name: entityId
 *         schema:
 *           type: string
 *         description: Filter stats by entity ID
 *     responses:
 *       200:
 *         description: Document statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalDocuments:
 *                   type: integer
 *                   description: Total number of documents
 *                 totalSize:
 *                   type: integer
 *                   description: Total size of all documents in bytes
 *                 averageSize:
 *                   type: number
 *                   description: Average document size in bytes
 *                 categoryCounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category:
 *                         type: string
 *                       _count:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: integer
 *                 recentDocuments:
 *                   type: integer
 *                   description: Number of documents created in the last 30 days
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/stats',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.EMPLOYEE, UserRole.VIEWER]),
  documentController.getDocumentStats.bind(documentController)
);

/**
 * @swagger
 * /documents/bulk:
 *   post:
 *     summary: Upload multiple documents
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: The files to upload
 *               category:
 *                 type: string
 *                 enum: [INVOICE, RECEIPT, CONTRACT, QUOTE, TAX_DOCUMENT, PROOF_OF_PAYMENT, IDENTIFICATION, INSURANCE, LEGAL, COMPLIANCE, FINANCIAL_STATEMENT, OTHER]
 *                 description: Default category for all documents
 *               entityType:
 *                 type: string
 *                 description: Entity type to attach documents to
 *               entityId:
 *                 type: string
 *                 description: Entity ID to attach documents to
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the documents are public
 *               isEncrypted:
 *                 type: boolean
 *                 description: Whether the documents should be encrypted
 *               accessLevel:
 *                 type: string
 *                 enum: [PUBLIC, PRIVATE, RESTRICTED]
 *                 description: Document access level
 *             required:
 *               - files
 *               - category
 *     responses:
 *       201:
 *         description: Documents uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       error:
 *                         type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  '/bulk',
  authorize([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT]),
  uploadMultiple('files'),
  validateBulkUpload,
  auditMiddleware('Document').create,
  documentController.uploadDocument.bind(documentController)
);

export default router;