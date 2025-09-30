import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/config';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiMeta {
  timestamp: string;
  version: string;
  requestId: string;
  pagination?: PaginationMeta;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any[];
    timestamp: string;
  };
  meta: {
    timestamp: string;
    version: string;
    requestId: string;
  };
}

/**
 * Generate standardized response metadata
 */
function generateMeta(pagination?: PaginationMeta): ApiMeta {
  return {
    timestamp: new Date().toISOString(),
    version: config.API_VERSION || '1.0.0',
    requestId: `req_${uuidv4().substring(0, 8)}`,
    ...(pagination && { pagination })
  };
}

/**
 * Send standardized success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  pagination?: PaginationMeta
): void {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    meta: generateMeta(pagination)
  };

  res.status(statusCode).json(response);
}

/**
 * Send standardized error response
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number = 400,
  details?: any[]
): void {
  const timestamp = new Date().toISOString();

  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      timestamp,
      ...(details && { details })
    },
    meta: {
      timestamp,
      version: config.API_VERSION || '1.0.0',
      requestId: `req_${uuidv4().substring(0, 8)}`
    }
  };

  res.status(statusCode).json(response);
}

/**
 * Send standardized validation error response
 */
export function sendValidationError(
  res: Response,
  errors: any[]
): void {
  sendError(
    res,
    'VALIDATION_ERROR',
    'Invalid input data provided',
    422,
    errors
  );
}

/**
 * Send standardized not found response
 */
export function sendNotFound(
  res: Response,
  resource: string,
  id?: string
): void {
  const message = id
    ? `${resource} with ID '${id}' not found`
    : `${resource} not found`;

  sendError(
    res,
    'NOT_FOUND',
    message,
    404
  );
}

/**
 * Send standardized unauthorized response
 */
export function sendUnauthorized(
  res: Response,
  message: string = 'Authentication required'
): void {
  sendError(
    res,
    'UNAUTHORIZED',
    message,
    401
  );
}

/**
 * Send standardized forbidden response
 */
export function sendForbidden(
  res: Response,
  message: string = 'Insufficient permissions'
): void {
  sendError(
    res,
    'FORBIDDEN',
    message,
    403
  );
}

/**
 * Send standardized internal server error response
 */
export function sendInternalError(
  res: Response,
  message: string = 'Internal server error occurred'
): void {
  sendError(
    res,
    'INTERNAL_ERROR',
    message,
    500
  );
}

/**
 * Send standardized empty list response
 */
export function sendEmptyList(
  res: Response,
  listName: string,
  pagination?: PaginationMeta
): void {
  const data = {
    [listName]: []
  };

  sendSuccess(res, data, 200, pagination);
}

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
  total: number,
  limit: number = 50,
  offset: number = 0
): PaginationMeta {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages
  };
}

/**
 * Simple success response (legacy support)
 */
export function successResponse(message: string, data?: any): any {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * Simple error response (legacy support)
 */
export function errorResponse(message: string, errors?: any): any {
  return {
    success: false,
    message,
    errors,
    timestamp: new Date().toISOString()
  };
}