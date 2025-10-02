import {  Document } from '@prisma/client';
import { DocumentCategory, ProcessingStatus, AccessLevel } from '../types/enums';
import { auditService } from './audit.service';
import { encryptionService } from './encryption.service';
import {
  calculateFileHash,
  validateFileContents,
  cleanupFile
} from '../middleware/upload.middleware';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';



import { prisma } from '../config/database';
interface CreateDocumentData {
  title?: string;
  description?: string;
  category: DocumentCategory;
  tags?: string[];
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  isEncrypted?: boolean;
  accessLevel?: AccessLevel;
  retentionDate?: Date;
}

interface UpdateDocumentData {
  title?: string;
  description?: string;
  category?: DocumentCategory;
  tags?: string[];
  isPublic?: boolean;
  accessLevel?: AccessLevel;
  retentionDate?: Date;
}

interface DocumentFilters {
  category?: DocumentCategory;
  entityType?: string;
  entityId?: string;
  tags?: string[];
  isPublic?: boolean;
  accessLevel?: AccessLevel;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class DocumentService {
  async uploadDocument(
    file: Express.Multer.File,
    data: CreateDocumentData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Document> {
    try {
      // Calculate file hash for integrity
      const fileHash = await calculateFileHash(file.path);

      // Validate file contents for security
      const isValidFile = await validateFileContents(file.path, file.mimetype);
      if (!isValidFile) {
        cleanupFile(file.path);
        throw new Error('Invalid file format or corrupted file');
      }

      // Check for duplicate files
      const existingDocument = await prisma.document.findFirst({
        where: {
          organizationId,
          hash: fileHash,
          deletedAt: null
        }
      });

      if (existingDocument) {
        cleanupFile(file.path);
        throw new Error('File already exists in the system');
      }

      // Handle encryption if required
      let encryptionKey = null;
      let encryptedFilePath = file.path;

      if (data.isEncrypted) {
        encryptionKey = await encryptionService.generateDocumentKey(organizationId);

        // Encrypt file contents
        const fileBuffer = await fs.readFile(file.path);
        const encryptedBuffer = await encryptionService.encryptDocumentContent(
          fileBuffer,
          organizationId,
          `temp_${Date.now()}`
        );

        // Write encrypted file back
        await fs.writeFile(file.path, encryptedBuffer);
        encryptedFilePath = file.path;
      }

      // Generate thumbnail for images
      let thumbnailPath = null;
      if (file.mimetype.startsWith('image/')) {
        thumbnailPath = await this.generateThumbnail(file.path, organizationId);
      }

      // Create document record
      const document = await prisma.document.create({
        data: {
          organizationId,
          uploadedById: auditContext.userId,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: file.path,
          hash: fileHash,
          title: data.title || file.originalname,
          description: data.description,
          category: data.category,
          tags: data.tags ? JSON.stringify(data.tags) : null,
          entityType: data.entityType,
          entityId: data.entityId,
          isPublic: data.isPublic || false,
          isEncrypted: data.isEncrypted || false,
          encryptionKey,
          accessLevel: data.accessLevel || AccessLevel.PRIVATE,
          retentionDate: data.retentionDate,
          thumbnailPath,
          processingStatus: ProcessingStatus.COMPLETED
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      await auditService.logCreate(
        'Document',
        document.id,
        {
          filename: document.filename,
          originalName: document.originalName,
          category: document.category,
          size: document.size,
          mimeType: document.mimeType
        },
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );

      return document;
    } catch (error) {
      // Clean up file on error
      cleanupFile(file.path);
      throw error;
    }
  }

  async getDocument(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Document | null> {
    const document = await prisma.document.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (document) {
      await auditService.logView(
        'Document',
        document.id,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return document;
  }

  async listDocuments(
    filters: DocumentFilters,
    organizationId: string
  ): Promise<{ documents: Document[]; total: number }> {
    const where: any = {
      organizationId,
      deletedAt: null
    };

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.entityType && filters.entityId) {
      where.entityType = filters.entityType;
      where.entityId = filters.entityId;
    }

    if (filters.isPublic !== undefined) {
      where.isPublic = filters.isPublic;
    }

    if (filters.accessLevel) {
      where.accessLevel = filters.accessLevel;
    }

    if (filters.tags && filters.tags.length > 0) {
      // Search for documents containing any of the specified tags
      where.tags = {
        contains: filters.tags[0] // Simplified tag search
      };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search } },
        { description: { contains: filters.search } },
        { originalName: { contains: filters.search } },
        { ocrText: { contains: filters.search } }
      ];
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      }),
      prisma.document.count({ where })
    ]);

    return { documents, total };
  }

  async updateDocument(
    id: string,
    data: UpdateDocumentData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Document> {
    const existingDocument = await prisma.document.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!existingDocument) {
      throw new Error('Document not found');
    }

    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
        isPublic: data.isPublic,
        accessLevel: data.accessLevel,
        retentionDate: data.retentionDate,
        updatedAt: new Date()
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    await auditService.logUpdate(
      'Document',
      id,
      existingDocument,
      updatedDocument,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedDocument;
  }

  async deleteDocument(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    permanent: boolean = false
  ): Promise<Document> {
    const existingDocument = await prisma.document.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      }
    });

    if (!existingDocument) {
      throw new Error('Document not found');
    }

    let deletedDocument: Document;

    if (permanent) {
      // Permanently delete file and record
      try {
        await fs.unlink(existingDocument.path);
        if (existingDocument.thumbnailPath) {
          await fs.unlink(existingDocument.thumbnailPath);
        }
      } catch (error) {
        console.warn('Could not delete physical file:', error);
      }

      deletedDocument = await prisma.document.delete({
        where: { id }
      });
    } else {
      // Soft delete
      deletedDocument = await prisma.document.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      });
    }

    await auditService.logDelete(
      'Document',
      id,
      existingDocument,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return deletedDocument;
  }

  async downloadDocument(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ document: Document; fileBuffer: Buffer }> {
    const document = await this.getDocument(id, organizationId, auditContext);

    if (!document) {
      throw new Error('Document not found');
    }

    try {
      let fileBuffer = await fs.readFile(document.path);

      // Decrypt file if it's encrypted
      if (document.isEncrypted) {
        fileBuffer = await encryptionService.decryptDocumentContent(
          fileBuffer,
          organizationId,
          document.id
        );
      }

      // Log download as view
      await auditService.logView(
        'Document',
        document.id,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );

      return { document, fileBuffer };
    } catch (error) {
      throw new Error('Failed to read document file');
    }
  }

  async createDocumentVersion(
    parentId: string,
    file: Express.Multer.File,
    data: CreateDocumentData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Document> {
    const parentDocument = await prisma.document.findFirst({
      where: {
        id: parentId,
        organizationId,
        deletedAt: null
      }
    });

    if (!parentDocument) {
      throw new Error('Parent document not found');
    }

    // Mark parent as not latest version
    await prisma.document.update({
      where: { id: parentId },
      data: { isLatestVersion: false }
    });

    // Create new version
    const newVersion = await this.uploadDocument(
      file,
      {
        ...data,
        title: data.title || parentDocument.title || undefined,
        category: data.category || (parentDocument.category as DocumentCategory),
        entityType: parentDocument.entityType ?? undefined,
        entityId: parentDocument.entityId ?? undefined
      },
      organizationId,
      auditContext
    );

    // Update new version with parent relationship
    const versionedDocument = await prisma.document.update({
      where: { id: newVersion.id },
      data: {
        parentId,
        version: parentDocument.version + 1,
        isLatestVersion: true
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return versionedDocument;
  }

  async getDocumentVersions(
    documentId: string,
    organizationId: string
  ): Promise<Document[]> {
    return prisma.document.findMany({
      where: {
        OR: [
          { id: documentId },
          { parentId: documentId }
        ],
        organizationId,
        deletedAt: null
      },
      orderBy: { version: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });
  }

  async attachDocumentToEntity(
    documentId: string,
    entityType: string,
    entityId: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Document> {
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        entityType,
        entityId,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Document',
      documentId,
      document,
      updatedDocument,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedDocument;
  }

  private async generateThumbnail(
    filePath: string,
    organizationId: string
  ): Promise<string> {
    try {
      const thumbnailDir = path.join(path.dirname(filePath), 'thumbnails');
      await fs.mkdir(thumbnailDir, { recursive: true });

      const filename = path.basename(filePath, path.extname(filePath));
      const thumbnailPath = path.join(thumbnailDir, `${filename}_thumb.jpg`);

      await sharp(filePath)
        .resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      return thumbnailPath;
    } catch (error) {
      console.warn('Failed to generate thumbnail:', error);
      return '';
    }
  }

  async getDocumentStats(
    organizationId: string,
    entityType?: string,
    entityId?: string
  ): Promise<any> {
    const where: any = { organizationId, deletedAt: null };
    if (entityType && entityId) {
      where.entityType = entityType;
      where.entityId = entityId;
    }

    const [
      totalDocuments,
      totalSize,
      categoryCounts,
      recentDocuments
    ] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.aggregate({
        where,
        _sum: { size: true }
      }),
      prisma.document.groupBy({
        by: ['category'],
        where,
        _count: { category: true }
      }),
      prisma.document.count({
        where: {
          ...where,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    return {
      totalDocuments,
      totalSize: totalSize._sum.size || 0,
      averageSize: totalDocuments > 0 ? (totalSize._sum.size || 0) / totalDocuments : 0,
      categoryCounts,
      recentDocuments
    };
  }
}

export const documentService = new DocumentService();