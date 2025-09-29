import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';

/**
 * Middleware to add deprecation warnings to legacy API endpoints
 *
 * @param route - The route being deprecated
 * @param sunsetDate - ISO date string when the endpoint will be removed
 * @param newRoute - Optional new route to migrate to
 */
export function addDeprecationWarnings(
  route: string,
  sunsetDate: string,
  newRoute?: string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Add deprecation headers
    res.setHeader('Deprecation', 'true');
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Sunset', sunsetDate);

    if (newRoute) {
      const migrateToUrl = newRoute.includes(':orgId')
        ? newRoute
        : `/api/${config.API_VERSION}/organizations/:organizationId${route}`;

      res.setHeader('X-API-Migrate-To', migrateToUrl);
      res.setHeader('Link', `<${migrateToUrl}>; rel="successor-version"`);
    }

    // Add warning header with details
    const warningMessage = `299 - "This API endpoint is deprecated and will be removed on ${sunsetDate}. ${
      newRoute ? `Please migrate to: ${newRoute}` : 'Please contact support for migration guidance.'
    }"`;

    res.setHeader('Warning', warningMessage);

    // Log deprecation usage for analytics
    if (config.NODE_ENV === 'production') {
      console.warn({
        message: 'Deprecated API endpoint accessed',
        route: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

/**
 * Middleware to track API version usage
 */
export function trackApiVersion(version: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-API-Version', version);
    next();
  };
}

/**
 * Middleware to enforce sunset date (block requests after date)
 *
 * @param sunsetDate - ISO date string when endpoint is no longer available
 */
export function enforceSunset(sunsetDate: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const sunset = new Date(sunsetDate);
    const now = new Date();

    if (now >= sunset) {
      res.status(410).json({
        error: 'Gone',
        message: `This API endpoint was sunset on ${sunsetDate} and is no longer available.`,
        sunsetDate: sunsetDate,
        documentation: '/api-docs'
      });
      return;
    }

    next();
  };
}