import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User & {
        id: string;
        organizationId: string;
      };
      masterOrg?: {
        id: string;
        name: string;
        domain: string;
      };
    }
  }
}

export interface AuthenticatedRequest extends Express.Request {
  user: User & {
    id: string;
    organizationId: string;
    role: string;
  };
  masterOrg?: {
    id: string;
    name: string;
    domain: string;
  };
}