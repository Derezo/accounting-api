import { Request, Response, NextFunction } from 'express';
import { intakeTokenService } from '../services/intake-token.service';
import { IntakeSession } from '@prisma/client';

/**
 * Extended request interface with intake session
 */
export interface IntakeRequest extends Request {
  intakeSession?: IntakeSession;
}

/**
 * Middleware: Validate intake token
 *
 * Extracts and validates X-Intake-Token header for public intake endpoints.
 * Attaches validated session to request object.
 *
 * @param required - If true, returns 401 when token is missing or invalid.
 *                   If false, continues to next middleware (for optional token endpoints).
 */
export const validateIntakeToken = (required: boolean = true) => {
  return async (req: IntakeRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.header('X-Intake-Token');

      // If token is missing
      if (!token) {
        if (required) {
          res.status(401).json({
            error: 'TOKEN_REQUIRED',
            message: 'X-Intake-Token header is required. Initialize a session first.',
            hint: 'Call POST /api/v1/public/intake/initialize to get a token'
          });
          return;
        }
        // Token is optional, continue without session
        next();
        return;
      }

      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      // Validate token
      const session = await intakeTokenService.validateToken(token, clientIp);

      if (!session) {
        if (required) {
          res.status(401).json({
            error: 'INVALID_TOKEN',
            message: 'Invalid or expired intake token. Please initialize a new session.',
            hint: 'Call POST /api/v1/public/intake/initialize to get a new token'
          });
          return;
        }
        // Token is invalid but optional, continue without session
        next();
        return;
      }

      // Check session status
      if (session.status !== 'ACTIVE') {
        res.status(403).json({
          error: 'SESSION_INACTIVE',
          message: `Session is ${session.status.toLowerCase()}. Cannot continue with this token.`,
          status: session.status,
          hint: session.status === 'COMPLETED'
            ? 'This session has been completed. Initialize a new session if needed.'
            : 'This session has been terminated. Please initialize a new session.'
        });
        return;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        // Mark session as expired
        await intakeTokenService.invalidateSession(session.id, 'EXPIRED');

        res.status(401).json({
          error: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please initialize a new session.',
          expiredAt: session.expiresAt.toISOString(),
          hint: 'Call POST /api/v1/public/intake/initialize to get a new token'
        });
        return;
      }

      // Note: Last activity timestamp is automatically updated by validateToken

      // Attach session to request
      req.intakeSession = session;

      next();
    } catch (error) {
      console.error('Intake token validation error:', error);

      // On error, fail closed (reject request) if required, or fail open (allow request) if optional
      if (required) {
        res.status(500).json({
          error: 'TOKEN_VALIDATION_ERROR',
          message: 'An error occurred while validating your session. Please try again.'
        });
        return;
      }

      // Token is optional and validation failed, continue without session
      next();
    }
  };
};

/**
 * Middleware: Require active intake session
 *
 * Enforces that a valid intake session must be attached to the request.
 * Use this AFTER validateIntakeToken(true) in middleware chain.
 */
export const requireIntakeSession = (
  req: IntakeRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.intakeSession) {
    res.status(401).json({
      error: 'SESSION_REQUIRED',
      message: 'No valid session found. Please initialize a session first.',
      hint: 'Call POST /api/v1/public/intake/initialize to get a token'
    });
    return;
  }

  next();
};

/**
 * Middleware: Validate step progression
 *
 * Ensures client is submitting steps in valid order.
 * Prevents skipping required steps.
 *
 * @param requiredStep - The step that must have been completed before this endpoint
 */
export const validateStepProgression = (requiredStep: string | null) => {
  return (req: IntakeRequest, res: Response, next: NextFunction): void => {
    if (!req.intakeSession) {
      res.status(401).json({
        error: 'SESSION_REQUIRED',
        message: 'No valid session found.'
      });
      return;
    }

    // If no required step, allow (this is the first step)
    if (!requiredStep) {
      next();
      return;
    }

    const completedSteps = JSON.parse(req.intakeSession.completedSteps || '[]') as string[];

    if (!completedSteps.includes(requiredStep)) {
      res.status(400).json({
        error: 'INVALID_STEP_PROGRESSION',
        message: `You must complete step "${requiredStep}" before proceeding.`,
        requiredStep,
        completedSteps,
        currentStep: req.intakeSession.currentStep
      });
      return;
    }

    next();
  };
};