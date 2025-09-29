import {  User } from '@prisma/client';
import { hashPassword } from '../utils/crypto';
import { auditService } from './audit.service';
import { UserRole } from '../types/enums';



import { prisma } from '../config/database';
interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  isActive?: boolean;
  organizationId: string;
  password: string;
}

interface UpdateUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  phone?: string;
  isActive?: boolean;
}

interface UserFilters {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export class UserService {
  async createUser(data: CreateUserData, createdBy: string): Promise<User> {
    try {
      // Check if user with email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email }
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash the password
      const passwordHash = await hashPassword(data.password);

      // Create the user
      const user = await prisma.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          phone: data.phone,
          isActive: data.isActive ?? true,
          organizationId: data.organizationId,
          passwordHash,
          emailVerified: false
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true
            }
          }
        }
      });

      // Log audit event
      await auditService.logAction({
        action: 'CREATE',
        entityType: 'USER',
        entityId: user.id,
        changes: {
          targetUserId: user.id,
          targetUserEmail: user.email,
          targetUserRole: user.role
        },
        context: {
          userId: createdBy,
          organizationId: data.organizationId
        }
      });

      return user;
    } catch (error) {
      throw new Error(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findUsers(filters: UserFilters, organizationId: string): Promise<{
    users: User[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    try {
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 50, 100); // Cap at 100
      const offset = (page - 1) * limit;

      // Build where clause
      const where: any = {
        organizationId,
        deletedAt: null
      };

      if (filters.role) {
        where.role = filters.role;
      }

      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        where.OR = [
          {
            firstName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            lastName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            email: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        ];
      }

      // Get total count
      const totalItems = await prisma.user.count({ where });

      // Get users
      const users = await prisma.user.findMany({
        where,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true
            }
          }
        },
        orderBy: [
          { createdAt: 'desc' }
        ],
        skip: offset,
        take: limit
      });

      const totalPages = Math.ceil(totalItems / limit);

      return {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserById(userId: string, organizationId: string): Promise<User | null> {
    try {
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          deletedAt: null
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true
            }
          }
        }
      });

      return user;
    } catch (error) {
      throw new Error(`Failed to fetch user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateUser(userId: string, data: UpdateUserData, organizationId: string, updatedBy: string): Promise<User> {
    try {
      // Check if user exists and belongs to organization
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          deletedAt: null
        }
      });

      if (!existingUser) {
        throw new Error('User not found');
      }

      // Check if email is being changed and doesn't conflict
      if (data.email && data.email !== existingUser.email) {
        const emailConflict = await prisma.user.findUnique({
          where: { email: data.email }
        });

        if (emailConflict) {
          throw new Error('Email already in use by another user');
        }
      }

      // Update the user
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...data,
          updatedAt: new Date()
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true
            }
          }
        }
      });

      // Log audit event
      await auditService.logAction({
        action: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        changes: {
          targetUserId: userId,
          targetUserEmail: user.email,
          changes: data
        },
        context: {
          userId: updatedBy,
          organizationId
        }
      });

      return user;
    } catch (error) {
      throw new Error(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteUser(userId: string, organizationId: string, deletedBy: string): Promise<void> {
    try {
      // Check if user exists and belongs to organization
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          deletedAt: null
        }
      });

      if (!existingUser) {
        throw new Error('User not found');
      }

      // Prevent self-deletion
      if (userId === deletedBy) {
        throw new Error('Users cannot delete themselves');
      }

      // Soft delete the user
      await prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          isActive: false,
          updatedAt: new Date()
        }
      });

      // Log audit event
      await auditService.logAction({
        action: 'DELETE',
        entityType: 'USER',
        entityId: userId,
        changes: {
          targetUserId: userId,
          targetUserEmail: existingUser.email
        },
        context: {
          userId: deletedBy,
          organizationId
        }
      });
    } catch (error) {
      throw new Error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async inviteUser(email: string, role: UserRole, organizationId: string, invitedBy: string): Promise<{
    success: boolean;
    message: string;
    inviteToken?: string;
  }> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return {
          success: false,
          message: 'User with this email already exists'
        };
      }

      // Generate invite token
      const inviteToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      // Create placeholder user with invite status
      const tempPassword = Math.random().toString(36).substring(2, 15);
      const passwordHash = await hashPassword(tempPassword);

      await prisma.user.create({
        data: {
          email,
          firstName: 'Pending',
          lastName: 'User',
          role,
          organizationId,
          passwordHash,
          isActive: false,
          emailVerified: false,
          passwordResetToken: inviteToken,
          passwordResetExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      // TODO: Send invite email with token

      // Log audit event
      await auditService.logAction({
        action: 'CREATE',
        entityType: 'USER_INVITE',
        entityId: 'pending',
        changes: {
          targetUserEmail: email,
          targetUserRole: role,
          inviteToken
        },
        context: {
          userId: invitedBy,
          organizationId
        }
      });

      return {
        success: true,
        message: 'User invitation sent successfully',
        inviteToken
      };
    } catch (error) {
      throw new Error(`Failed to invite user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async resendInvite(userId: string, organizationId: string, resentBy: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          isActive: false,
          emailVerified: false,
          deletedAt: null
        }
      });

      if (!user) {
        return {
          success: false,
          message: 'User not found or already activated'
        };
      }

      // Generate new invite token
      const inviteToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordResetToken: inviteToken,
          passwordResetExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      // TODO: Send invite email with new token

      // Log audit event
      await auditService.logAction({
        action: 'UPDATE',
        entityType: 'USER_INVITE',
        entityId: userId,
        changes: {
          targetUserId: userId,
          targetUserEmail: user.email
        },
        context: {
          userId: resentBy,
          organizationId
        }
      });

      return {
        success: true,
        message: 'Invitation resent successfully'
      };
    } catch (error) {
      throw new Error(`Failed to resend invite: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async activateUser(userId: string, organizationId: string, activatedBy: string): Promise<User> {
    try {
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          deletedAt: null
        }
      });

      if (!existingUser) {
        throw new Error('User not found');
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: true,
          updatedAt: new Date()
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true
            }
          }
        }
      });

      await auditService.logAction({
        action: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        changes: {
          targetUserId: userId,
          targetUserEmail: user.email,
          activation: true
        },
        context: {
          userId: activatedBy,
          organizationId
        }
      });

      return user;
    } catch (error) {
      throw new Error(`Failed to activate user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deactivateUser(userId: string, organizationId: string, deactivatedBy: string): Promise<User> {
    try {
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          deletedAt: null
        }
      });

      if (!existingUser) {
        throw new Error('User not found');
      }

      if (userId === deactivatedBy) {
        throw new Error('Users cannot deactivate themselves');
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          updatedAt: new Date()
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true
            }
          }
        }
      });

      await auditService.logAction({
        action: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        changes: {
          targetUserId: userId,
          targetUserEmail: user.email,
          deactivation: true
        },
        context: {
          userId: deactivatedBy,
          organizationId
        }
      });

      return user;
    } catch (error) {
      throw new Error(`Failed to deactivate user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserStatus(userId: string, organizationId: string): Promise<{
    userId: string;
    isActive: boolean;
    emailVerified: boolean;
    lastLogin: Date | null;
    accountStatus: 'active' | 'inactive' | 'pending' | 'suspended';
    loginAttempts: number;
    lockedUntil: Date | null;
  }> {
    try {
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
          deletedAt: null
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Determine account status
      let accountStatus: 'active' | 'inactive' | 'pending' | 'suspended' = 'inactive';
      if (user.isActive && user.emailVerified) {
        accountStatus = 'active';
      } else if (user.isActive && !user.emailVerified) {
        accountStatus = 'pending';
      } else if (!user.isActive) {
        accountStatus = 'inactive';
      }

      return {
        userId: user.id,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        lastLogin: user.lastLoginAt,
        accountStatus,
        loginAttempts: user.failedAttempts || 0,
        lockedUntil: user.lockedUntil
      };
    } catch (error) {
      throw new Error(`Failed to get user status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const userService = new UserService();