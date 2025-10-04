import { Request, Response, NextFunction } from 'express';
import { featureToggleService } from '../services/feature-toggle.service';
import { AuthenticatedRequest } from './auth.middleware';
import { logger } from '../utils/logger';

/**
 * Feature Toggle Middleware
 *
 * Provides middleware helpers for checking feature toggles in routes.
 *
 * @example
 * // Protect a route with a feature toggle
 * router.get('/beta-feature',
 *   requireFeature('beta_dashboard'),
 *   controller.betaFeature
 * );
 */

/**
 * Middleware to require a feature toggle to be enabled
 *
 * Returns 403 Forbidden if feature is not enabled for the user/organization
 *
 * @param featureKey - The feature toggle key to check
 * @param options - Optional configuration
 */
export function requireFeature(
  featureKey: string,
  options?: {
    errorMessage?: string;
    logAccess?: boolean;
  }
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      // Check if feature is enabled
      const result = await featureToggleService.isEnabled(featureKey, {
        userId: authReq.user?.id,
        organizationId: authReq.user?.organizationId
      });

      if (!result.enabled) {
        if (options?.logAccess) {
          logger.info(`Feature access denied: ${featureKey} for user ${authReq.user?.id}`, {
            reason: result.reason,
            userId: authReq.user?.id,
            organizationId: authReq.user?.organizationId
          });
        }

        res.status(403).json({
          success: false,
          message: options?.errorMessage || 'Feature not available',
          featureKey,
          reason: result.reason
        });
        return;
      }

      if (options?.logAccess) {
        logger.info(`Feature access granted: ${featureKey} for user ${authReq.user?.id}`, {
          reason: result.reason,
          userId: authReq.user?.id,
          organizationId: authReq.user?.organizationId
        });
      }

      // Attach feature check result to request for controllers to use
      (req as any).feature = result;

      next();
    } catch (error: any) {
      logger.error(`Feature check error for ${featureKey}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to check feature availability',
        error: error.message
      });
    }
  };
}

/**
 * Middleware to check feature toggle and attach result to request
 *
 * Does not block access, just attaches feature check result to request.feature
 * Useful for conditional feature display without blocking
 *
 * @param featureKey - The feature toggle key to check
 */
export function checkFeature(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      const result = await featureToggleService.isEnabled(featureKey, {
        userId: authReq.user?.id,
        organizationId: authReq.user?.organizationId
      });

      // Attach to request for controller to use
      (req as any).feature = result;

      next();
    } catch (error: any) {
      logger.error(`Feature check error for ${featureKey}:`, error);
      // Don't fail the request, just set feature as disabled
      (req as any).feature = {
        enabled: false,
        reason: 'Check failed'
      };
      next();
    }
  };
}

/**
 * Helper to check multiple features (all must be enabled)
 *
 * @param featureKeys - Array of feature keys to check
 * @param options - Optional configuration
 */
export function requireAllFeatures(
  featureKeys: string[],
  options?: {
    errorMessage?: string;
    logAccess?: boolean;
  }
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      const results = await Promise.all(
        featureKeys.map(key =>
          featureToggleService.isEnabled(key, {
            userId: authReq.user?.id,
            organizationId: authReq.user?.organizationId
          })
        )
      );

      const allEnabled = results.every(r => r.enabled);
      const disabledFeatures = featureKeys.filter((key, i) => !results[i].enabled);

      if (!allEnabled) {
        if (options?.logAccess) {
          logger.info(`Multi-feature access denied for user ${authReq.user?.id}`, {
            requiredFeatures: featureKeys,
            disabledFeatures,
            userId: authReq.user?.id,
            organizationId: authReq.user?.organizationId
          });
        }

        res.status(403).json({
          success: false,
          message: options?.errorMessage || 'Required features not available',
          requiredFeatures: featureKeys,
          disabledFeatures
        });
        return;
      }

      if (options?.logAccess) {
        logger.info(`Multi-feature access granted for user ${authReq.user?.id}`, {
          features: featureKeys,
          userId: authReq.user?.id,
          organizationId: authReq.user?.organizationId
        });
      }

      next();
    } catch (error: any) {
      logger.error('Multi-feature check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check feature availability',
        error: error.message
      });
    }
  };
}

/**
 * Helper to check if any of the features is enabled
 *
 * @param featureKeys - Array of feature keys to check
 * @param options - Optional configuration
 */
export function requireAnyFeature(
  featureKeys: string[],
  options?: {
    errorMessage?: string;
    logAccess?: boolean;
  }
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      const results = await Promise.all(
        featureKeys.map(key =>
          featureToggleService.isEnabled(key, {
            userId: authReq.user?.id,
            organizationId: authReq.user?.organizationId
          })
        )
      );

      const anyEnabled = results.some(r => r.enabled);
      const enabledFeatures = featureKeys.filter((key, i) => results[i].enabled);

      if (!anyEnabled) {
        if (options?.logAccess) {
          logger.info(`No feature access for user ${authReq.user?.id}`, {
            requiredFeatures: featureKeys,
            userId: authReq.user?.id,
            organizationId: authReq.user?.organizationId
          });
        }

        res.status(403).json({
          success: false,
          message: options?.errorMessage || 'No required features available',
          requiredFeatures: featureKeys
        });
        return;
      }

      if (options?.logAccess) {
        logger.info(`Feature access granted for user ${authReq.user?.id}`, {
          enabledFeatures,
          userId: authReq.user?.id,
          organizationId: authReq.user?.organizationId
        });
      }

      next();
    } catch (error: any) {
      logger.error('Feature check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check feature availability',
        error: error.message
      });
    }
  };
}
