import { PrismaClient, Project } from '@prisma/client';
import { auditService } from './audit.service';
import { ProjectStatus } from '../types/enums';

let prisma: PrismaClient;

// Allow dependency injection for testing
export const setPrismaInstance = (instance: PrismaClient) => {
  prisma = instance;
};

// Initialize with default instance
prisma = new PrismaClient();

export interface CreateProjectData {
  customerId: string;
  name: string;
  description?: string;
  priority?: number;
  startDate?: Date;
  endDate?: Date;
  estimatedHours?: number;
  hourlyRate?: number;
  fixedPrice?: number;
  assignedToId?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: number;
  startDate?: Date;
  endDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  hourlyRate?: number;
  fixedPrice?: number;
  assignedToId?: string;
}

export interface ListProjectsFilter {
  customerId?: string;
  assignedToId?: string;
  status?: ProjectStatus;
  priority?: number;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface ProjectStats {
  totalProjects: number;
  projectsByStatus: Record<ProjectStatus, number>;
  projectsByPriority: Record<number, number>;
  totalEstimatedHours: number;
  totalActualHours: number;
  totalEstimatedValue: number;
  averageCompletionTime: number;
  activeProjects: number;
  overdueTasks: number;
}

export interface WorkAuthorizationData {
  projectId: string;
  authorizedBy: string;
  scopeOfWork: string;
  estimatedCost: number;
  timeframe: string;
  terms?: string;
  notes?: string;
}

export class ProjectService {
  private generateProjectNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `PRJ-${timestamp}-${random}`.toUpperCase();
  }

  async createProject(
    data: CreateProjectData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    // Verify customer exists and belongs to organization
    const customer = await prisma.customer.findFirst({
      where: {
        id: data.customerId,
        organizationId,
        deletedAt: null
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Verify assigned user exists and belongs to organization (if provided)
    if (data.assignedToId) {
      const assignedUser = await prisma.user.findFirst({
        where: {
          id: data.assignedToId,
          organizationId,
          isActive: true
        }
      });

      if (!assignedUser) {
        throw new Error('Assigned user not found or inactive');
      }
    }

    const projectNumber = this.generateProjectNumber();

    const project = await prisma.project.create({
      data: {
        organizationId,
        projectNumber,
        customerId: data.customerId,
        name: data.name,
        description: data.description,
        status: ProjectStatus.QUOTED,
        priority: data.priority || 3,
        startDate: data.startDate,
        endDate: data.endDate,
        estimatedHours: data.estimatedHours,
        hourlyRate: data.hourlyRate,
        fixedPrice: data.fixedPrice,
        assignedToId: data.assignedToId
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        assignedTo: true,
        appointments: true
      }
    });

    // Log project creation
    await auditService.logAction({
      action: 'CREATE',
      entityType: 'Project',
      entityId: project.id,
      changes: { project: project },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return project;
  }

  async getProject(
    id: string,
    organizationId: string
  ): Promise<any> {
    return await prisma.project.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        assignedTo: true,
        appointments: {
          where: { cancelled: false },
          orderBy: { startTime: 'asc' }
        }
      }
    });
  }

  async updateProject(
    id: string,
    data: UpdateProjectData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    const existingProject = await this.getProject(id, organizationId);
    if (!existingProject) {
      throw new Error('Project not found');
    }

    // Verify assigned user exists and belongs to organization (if provided)
    if (data.assignedToId) {
      const assignedUser = await prisma.user.findFirst({
        where: {
          id: data.assignedToId,
          organizationId,
          isActive: true
        }
      });

      if (!assignedUser) {
        throw new Error('Assigned user not found or inactive');
      }
    }

    // Handle status transitions
    const updateData: any = { ...data };

    // Set completion date when project is completed
    if (data.status === ProjectStatus.COMPLETED && existingProject.status !== ProjectStatus.COMPLETED) {
      updateData.completedAt = new Date();
      updateData.actualEndDate = updateData.actualEndDate || new Date();
    }

    // Set actual start date when project moves to IN_PROGRESS
    if (data.status === ProjectStatus.IN_PROGRESS && existingProject.status !== ProjectStatus.IN_PROGRESS) {
      updateData.actualStartDate = updateData.actualStartDate || new Date();
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData
    });

    // Log project update
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'Project',
      entityId: id,
      changes: {
        before: existingProject,
        after: project,
        updated: data
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return project;
  }

  async authorizeWork(
    authData: WorkAuthorizationData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    const project = await this.getProject(authData.projectId, organizationId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Update project status to APPROVED
    const updatedProject = await this.updateProject(
      authData.projectId,
      {
        status: ProjectStatus.APPROVED,
        description: project.description ?
          `${project.description}\n\nWork Authorization:\nScope: ${authData.scopeOfWork}\nEstimated Cost: $${authData.estimatedCost}\nTimeframe: ${authData.timeframe}\nAuthorized by: ${authData.authorizedBy}${authData.terms ? `\nTerms: ${authData.terms}` : ''}${authData.notes ? `\nNotes: ${authData.notes}` : ''}` :
          `Work Authorization:\nScope: ${authData.scopeOfWork}\nEstimated Cost: $${authData.estimatedCost}\nTimeframe: ${authData.timeframe}\nAuthorized by: ${authData.authorizedBy}${authData.terms ? `\nTerms: ${authData.terms}` : ''}${authData.notes ? `\nNotes: ${authData.notes}` : ''}`
      },
      organizationId,
      auditContext
    );

    // Log work authorization
    await auditService.logAction({
      action: 'AUTHORIZE',
      entityType: 'Project',
      entityId: authData.projectId,
      changes: {
        workAuthorization: authData,
        previousStatus: project.status,
        newStatus: ProjectStatus.APPROVED
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return updatedProject;
  }

  async startProject(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    const project = await this.getProject(id, organizationId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.status !== ProjectStatus.APPROVED) {
      throw new Error('Project must be approved before it can be started');
    }

    return await this.updateProject(
      id,
      {
        status: ProjectStatus.IN_PROGRESS,
        actualStartDate: new Date()
      },
      organizationId,
      auditContext
    );
  }

  async completeProject(
    id: string,
    actualHours?: number,
    organizationId?: string,
    auditContext?: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    const project = await this.getProject(id, organizationId!);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.status !== ProjectStatus.IN_PROGRESS && project.status !== ProjectStatus.ON_HOLD) {
      throw new Error('Only in-progress or on-hold projects can be completed');
    }

    return await this.updateProject(
      id,
      {
        status: ProjectStatus.COMPLETED,
        actualHours: actualHours || project.actualHours,
        actualEndDate: new Date()
      },
      organizationId!,
      auditContext!
    );
  }

  async updateTimeTracking(
    id: string,
    hoursWorked: number,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    const project = await this.getProject(id, organizationId);
    if (!project) {
      throw new Error('Project not found');
    }

    const newActualHours = (project.actualHours || 0) + hoursWorked;

    const updatedProject = await this.updateProject(
      id,
      { actualHours: newActualHours },
      organizationId,
      auditContext
    );

    // Log time tracking update
    await auditService.logAction({
      action: 'UPDATE',
      entityType: 'Project',
      entityId: id,
      changes: {
        timeTracking: {
          hoursAdded: hoursWorked,
          previousHours: project.actualHours || 0,
          newTotalHours: newActualHours
        }
      },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });

    return updatedProject;
  }

  async listProjects(
    organizationId: string,
    filter: ListProjectsFilter = {},
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const where: any = {
      organizationId,
      deletedAt: null
    };

    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.assignedToId) where.assignedToId = filter.assignedToId;
    if (filter.status) where.status = filter.status;
    if (filter.priority) where.priority = filter.priority;
    if (filter.startDate || filter.endDate) {
      where.startDate = {};
      if (filter.startDate) where.startDate.gte = filter.startDate;
      if (filter.endDate) where.startDate.lte = filter.endDate;
    }
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { projectNumber: { contains: filter.search, mode: 'insensitive' } }
      ];
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          assignedTo: true,
          appointments: {
            where: { cancelled: false }
          }
        },
        orderBy: [
          { priority: 'asc' },
          { createdAt: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.project.count({ where })
    ]);

    return {
      projects: projects as any,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getProjectStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ProjectStats> {
    const where: any = {
      organizationId,
      deletedAt: null
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [projects, overdueCount] = await Promise.all([
      prisma.project.findMany({
        where,
        select: {
          status: true,
          priority: true,
          estimatedHours: true,
          actualHours: true,
          hourlyRate: true,
          fixedPrice: true,
          createdAt: true,
          completedAt: true,
          endDate: true
        }
      }),
      prisma.project.count({
        where: {
          ...where,
          endDate: { lt: new Date() },
          status: { in: [ProjectStatus.QUOTED, ProjectStatus.APPROVED, ProjectStatus.IN_PROGRESS] }
        }
      })
    ]);

    const totalProjects = projects.length;
    const activeProjects = projects.filter(p =>
      p.status === ProjectStatus.APPROVED || p.status === ProjectStatus.IN_PROGRESS
    ).length;

    const projectsByStatus = projects.reduce((acc, p) => {
      acc[p.status as ProjectStatus] = (acc[p.status as ProjectStatus] || 0) + 1;
      return acc;
    }, {} as Record<ProjectStatus, number>);

    const projectsByPriority = projects.reduce((acc, p) => {
      acc[p.priority] = (acc[p.priority] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const totalEstimatedHours = projects.reduce((sum, p) => sum + (Number(p.estimatedHours) || 0), 0);
    const totalActualHours = projects.reduce((sum, p) => sum + (Number(p.actualHours) || 0), 0);

    const totalEstimatedValue = projects.reduce((sum, p) => {
      if (p.fixedPrice) return sum + Number(p.fixedPrice);
      if (p.hourlyRate && p.estimatedHours) return sum + (Number(p.hourlyRate) * Number(p.estimatedHours));
      return sum;
    }, 0);

    const completedProjects = projects.filter(p => p.completedAt);
    const averageCompletionTime = completedProjects.length > 0
      ? completedProjects.reduce((sum, p) => {
          const startTime = p.createdAt.getTime();
          const endTime = p.completedAt!.getTime();
          return sum + (endTime - startTime);
        }, 0) / (completedProjects.length * 24 * 60 * 60 * 1000) // Convert to days
      : 0;

    return {
      totalProjects,
      projectsByStatus,
      projectsByPriority,
      totalEstimatedHours,
      totalActualHours,
      totalEstimatedValue,
      averageCompletionTime: Math.round(averageCompletionTime * 100) / 100,
      activeProjects,
      overdueTasks: overdueCount
    };
  }

  async assignProject(
    id: string,
    assignedToId: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    return await this.updateProject(
      id,
      { assignedToId },
      organizationId,
      auditContext
    );
  }

  async deleteProject(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const project = await this.getProject(id, organizationId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Soft delete
    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    // Log project deletion
    await auditService.logAction({
      action: 'DELETE',
      entityType: 'Project',
      entityId: id,
      changes: { deletedProject: project },
      context: {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    });
  }
}

export const projectService = new ProjectService();