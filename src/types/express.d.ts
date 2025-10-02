import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: string;
        sessionId: string;
        isTestToken?: boolean;
      };
      masterOrg?: {
        id: string;
        name: string;
        domain: string;
      };
      body?: any;
      params?: any;
    }
  }
}

export interface AuthenticatedRequest extends Express.Request {
  user: {
    id: string;
    organizationId: string;
    role: string;
    sessionId: string;
    isTestToken?: boolean;
  };
  masterOrg?: {
    id: string;
    name: string;
    domain: string;
  };
}