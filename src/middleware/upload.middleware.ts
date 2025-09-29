import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import mimeTypes from 'mime-types';

// Configuration
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Allowed file types for security
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json'
];

// Create upload directory if it doesn't exist
const ensureUploadDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Generate secure filename
const generateSecureFilename = (originalname: string): string => {
  const ext = path.extname(originalname);
  const name = path.basename(originalname, ext);
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');

  // Sanitize original name
  const sanitizedName = name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50);

  return `${timestamp}_${random}_${sanitizedName}${ext}`;
};

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return cb(new Error('Organization not found'), '');
    }

    const orgDir = path.join(UPLOAD_DIR, organizationId);
    ensureUploadDir(orgDir);
    cb(null, orgDir);
  },
  filename: (req, file, cb) => {
    const secureFilename = generateSecureFilename(file.originalname);
    cb(null, secureFilename);
  }
});

// File filter for security
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} not allowed`));
  }

  // Validate file extension matches MIME type
  const expectedExt = mimeTypes.extension(file.mimetype);
  const actualExt = path.extname(file.originalname).toLowerCase().substring(1);

  if (expectedExt && expectedExt !== actualExt) {
    return cb(new Error('File extension does not match MIME type'));
  }

  cb(null, true);
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10 // Maximum 10 files per request
  }
});

// Middleware for single file upload
export const uploadSingle = (fieldName: string): (req: Request, res: Response, next: NextFunction) => void => {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload.single(fieldName)(req, res, (err: any): void => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: 'File too large',
            message: `File size cannot exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`
          });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          res.status(400).json({
            error: 'Too many files',
            message: 'Maximum 10 files allowed per upload'
          });
          return;
        }
        res.status(400).json({
          error: 'Upload error',
          message: err.message
        });
        return;
      }

      if (err) {
        res.status(400).json({
          error: 'Upload failed',
          message: err.message
        });
        return;
      }

      next();
    });
  };
};

// Middleware for multiple file upload
export const uploadMultiple = (fieldName: string, maxCount: number = 10): (req: Request, res: Response, next: NextFunction) => void => {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload.array(fieldName, maxCount)(req, res, (err: any): void => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: 'File too large',
            message: `File size cannot exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`
          });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          res.status(400).json({
            error: 'Too many files',
            message: `Maximum ${maxCount} files allowed per upload`
          });
          return;
        }
        res.status(400).json({
          error: 'Upload error',
          message: err.message
        });
        return;
      }

      if (err) {
        res.status(400).json({
          error: 'Upload failed',
          message: err.message
        });
        return;
      }

      next();
    });
  };
};

// Calculate file hash for integrity checking
export const calculateFileHash = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
};

// Validate uploaded file security
export const validateFileContents = async (filePath: string, mimeType: string): Promise<boolean> => {
  try {
    // Read first few bytes to check file signature
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    // Check common file signatures
    const signatures: { [key: string]: Buffer[] } = {
      'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
      'image/jpeg': [
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE1]),
        Buffer.from([0xFF, 0xD8, 0xFF, 0xDB])
      ],
      'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
      'image/gif': [
        Buffer.from('GIF87a'),
        Buffer.from('GIF89a')
      ]
    };

    const expectedSignatures = signatures[mimeType];
    if (!expectedSignatures) {
      return true; // Allow types without specific signatures
    }

    return expectedSignatures.some(signature =>
      buffer.subarray(0, signature.length).equals(signature)
    );
  } catch (error) {
    console.error('File validation error:', error);
    return false;
  }
};

// Clean up uploaded file on error
export const cleanupFile = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error cleaning up file:', error);
  }
};

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, UPLOAD_DIR };