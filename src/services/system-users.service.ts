import prisma from '@/config/database';
import { User } from '@prisma/client';
import { systemLogsService } from './system-logs.service';
import { AuditService } from './audit.service';
import { AuditAction } from '@/types/enums';
import crypto from 'crypto';

/**
 * @typedef {Object} UserFilters
 * @property {string} [organizationId] - Filter by organization ID
 * @property {string} [role] - Filter by user role
 * @property {boolean} [isActive] - Filter by active status
 * @property {string} [search] - Search by name or email
 * @property {number} [page] - Page number for pagination
 * @property {number} [limit] - Number of results per page
 */
export interface UserFilters {
  organizationId?: string;
  role?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * @typedef {Object} UserWithOrganization
 * @property {User} user - User data
 * @property {Object} organization - Organization data
 */
export interface UserWithOrganization extends User {
  organization: {
    id: string;
    name: string;
    domain: string | null;
    isActive: boolean;
  };
}

/**
 * @typedef {Object} ImpersonationSession
 * @property {string} token - Impersonation session token
 * @property {string} userId - User being impersonated
 * @property {string} adminId - Admin performing impersonation
 * @property {Date} expiresAt - Token expiration timestamp
 */
export interface ImpersonationSession {
  token: string;
  userId: string;
  adminId: string;
  expiresAt: Date;
}

/**
 * @typedef {Object} DeactivationResult
 * @property {string} userId - Deactivated user ID
 * @property {string} reason - Deactivation reason
 * @property {Date} deactivatedAt - Deactivation timestamp
 */
export interface DeactivationResult {
  userId: string;
  reason: string;
  deactivatedAt: Date;
}

const auditService = new AuditService();

/**
 * Service class for managing system-wide users (SUPER_ADMIN operations)
 */
class SystemUsersService {
  /**
   * Get all users across organizations with optional filtering
   *
   * @param {UserFilters} filters - Filter options
   * @returns {Promise<{users: UserWithOrganization[], total: number, page: number, pages: number}>}
   */
  async getAllUsers(
    filters: UserFilters = {}
  ): Promise<{ users: UserWithOrganization[]; total: number; page: number; pages: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Apply filters
    if (filters.organizationId) {
      where.organizationId = filters.organizationId;
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    // Exclude soft-deleted users
    where.deletedAt = null;

    // Search filter
    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search } },
        { lastName: { contains: filters.search } },
        { email: { contains: filters.search } },
      ];
    }

    // Execute queries in parallel
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Log system access
    await systemLogsService.info(
      `System users query: ${total} users found with filters: ${JSON.stringify(filters)}`,
      'system-users-service'
    );

    return {
      users: users as UserWithOrganization[],
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get user by ID with organization details
   *
   * @param {string} id - User ID
   * @returns {Promise<UserWithOrganization | null>}
   */
  async getUserById(id: string): Promise<UserWithOrganization | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            domain: true,
            isActive: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!user) {
      await systemLogsService.warn(
        `User not found: ${id}`,
        'system-users-service'
      );
      return null;
    }

    return user as UserWithOrganization;
  }

  /**
   * Create impersonation session token for admin to impersonate user
   * CRITICAL: This creates an audit trail of admin impersonation
   *
   * @param {string} userId - User ID to impersonate
   * @param {string} adminId - Admin performing impersonation
   * @param {string} organizationId - Master organization ID for audit
   * @returns {Promise<ImpersonationSession>}
   * @throws {Error} If user not found or impersonation not allowed
   */
  async impersonateUser(
    userId: string,
    adminId: string,
    organizationId: string
  ): Promise<ImpersonationSession> {
    // Verify user exists
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify admin exists
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin user not found');
    }

    // Prevent impersonating other SUPER_ADMINs
    if (user.role === 'SUPER_ADMIN') {
      await systemLogsService.error(
        `SECURITY: Admin ${adminId} attempted to impersonate SUPER_ADMIN ${userId}`,
        'system-users-service',
        new Error('Cannot impersonate SUPER_ADMIN')
      );
      throw new Error('Cannot impersonate SUPER_ADMIN users');
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 4); // 4-hour expiration

    // Create impersonation session in metadata
    const session: ImpersonationSession = {
      token,
      userId,
      adminId,
      expiresAt,
    };

    // CRITICAL: Create audit trail
    await auditService.logAction({
      action: AuditAction.USER_IMPERSONATION,
      entityType: 'User',
      entityId: userId,
      details: {
        adminId,
        adminEmail: admin.email,
        targetUserId: userId,
        targetUserEmail: user.email,
        targetOrganization: user.organization.name,
        expiresAt: expiresAt.toISOString(),
      },
      context: {
        userId: adminId,
        organizationId,
      },
    });

    // Log system event
    await systemLogsService.info(
      `Admin ${admin.email} (${adminId}) started impersonation of ${user.email} (${userId}) - expires ${expiresAt.toISOString()}`,
      'system-users-service',
      {
        adminId,
        userId,
        expiresAt: expiresAt.toISOString(),
      }
    );

    return session;
  }

  /**
   * Deactivate user account
   *
   * @param {string} userId - User ID to deactivate
   * @param {string} reason - Reason for deactivation
   * @param {string} adminId - Admin performing deactivation
   * @param {string} organizationId - Master organization ID for audit
   * @returns {Promise<DeactivationResult>}
   * @throws {Error} If user not found
   */
  async deactivateUser(
    userId: string,
    reason: string,
    adminId: string,
    organizationId: string
  ): Promise<DeactivationResult> {
    // Verify user exists
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify admin exists
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin user not found');
    }

    // Prevent deactivating SUPER_ADMINs
    if (user.role === 'SUPER_ADMIN') {
      await systemLogsService.error(
        `SECURITY: Admin ${adminId} attempted to deactivate SUPER_ADMIN ${userId}`,
        'system-users-service',
        new Error('Cannot deactivate SUPER_ADMIN')
      );
      throw new Error('Cannot deactivate SUPER_ADMIN users');
    }

    // Update user status
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    const deactivatedAt = new Date();

    // Create audit trail
    await auditService.logAction({
      action: AuditAction.USER_DEACTIVATED,
      entityType: 'User',
      entityId: userId,
      details: {
        adminId,
        adminEmail: admin.email,
        targetUserId: userId,
        targetUserEmail: user.email,
        targetOrganization: user.organization.name,
        reason,
        deactivatedAt: deactivatedAt.toISOString(),
      },
      context: {
        userId: adminId,
        organizationId,
      },
    });

    // Log system event
    await systemLogsService.warn(
      `Admin ${admin.email} (${adminId}) deactivated user ${user.email} (${userId}). Reason: ${reason}`,
      'system-users-service',
      {
        adminId,
        userId,
        reason,
        deactivatedAt: deactivatedAt.toISOString(),
      }
    );

    return {
      userId,
      reason,
      deactivatedAt,
    };
  }

  /**
   * Reactivate user account
   *
   * @param {string} userId - User ID to reactivate
   * @param {string} adminId - Admin performing reactivation
   * @param {string} organizationId - Master organization ID for audit
   * @returns {Promise<User>}
   * @throws {Error} If user not found
   */
  async reactivateUser(
    userId: string,
    adminId: string,
    organizationId: string
  ): Promise<User> {
    // Verify user exists
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify admin exists
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin user not found');
    }

    // Update user status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Create audit trail
    await auditService.logAction({
      action: AuditAction.USER_REACTIVATED,
      entityType: 'User',
      entityId: userId,
      details: {
        adminId,
        adminEmail: admin.email,
        targetUserId: userId,
        targetUserEmail: user.email,
        targetOrganization: user.organization.name,
        reactivatedAt: new Date().toISOString(),
      },
      context: {
        userId: adminId,
        organizationId,
      },
    });

    // Log system event
    await systemLogsService.info(
      `Admin ${admin.email} (${adminId}) reactivated user ${user.email} (${userId})`,
      'system-users-service',
      {
        adminId,
        userId,
        reactivatedAt: new Date().toISOString(),
      }
    );

    return updatedUser;
  }

  /**
   * Get user statistics across all organizations
   *
   * @returns {Promise<Object>} User statistics
   */
  async getUserStatistics(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
    byOrganization: Record<string, number>;
  }> {
    const [total, active, inactive, users] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      prisma.user.count({ where: { deletedAt: null, isActive: false } }),
      prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          role: true,
          organizationId: true,
        },
      }),
    ]);

    // Aggregate by role
    const byRole: Record<string, number> = {};
    users.forEach((user) => {
      byRole[user.role] = (byRole[user.role] || 0) + 1;
    });

    // Aggregate by organization
    const byOrganization: Record<string, number> = {};
    users.forEach((user) => {
      byOrganization[user.organizationId] = (byOrganization[user.organizationId] || 0) + 1;
    });

    return {
      total,
      active,
      inactive,
      byRole,
      byOrganization,
    };
  }
}

export default new SystemUsersService();
