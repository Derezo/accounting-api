import { PrismaClient } from '@prisma/client';
import { ProjectService, setPrismaInstance } from '../../src/services/project.service';
import { auditService } from '../../src/services/audit.service';
import { ProjectStatus } from '../../src/types/enums';

// Mock Prisma
jest.mock('@prisma/client');
jest.mock('../../src/services/audit.service');

const mockPrisma = {
  customer: {
    findFirst: jest.fn()
  },
  user: {
    findFirst: jest.fn()
  },
  project: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  }
};

const mockAuditService = auditService as jest.Mocked<typeof auditService>;

// Mock PrismaClient constructor
(PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(() => mockPrisma as any);

// Override the imported prisma instance in the service
jest.doMock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

describe('ProjectService', () => {
  let service: ProjectService;
  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';
  const mockCustomerId = 'customer-123';
  const mockAuditContext = {
    userId: mockUserId,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent'
  };

  beforeEach(() => {
    service = new ProjectService();
    setPrismaInstance(mockPrisma as any);
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    const mockProjectData = {
      customerId: mockCustomerId,
      name: 'Test Project',
      description: 'Test Description',
      priority: 3,
      estimatedHours: 40,
      hourlyRate: 100,
      assignedToId: 'assigned-user-123'
    };

    const mockCustomer = {
      id: mockCustomerId,
      organizationId: mockOrganizationId,
      deletedAt: null
    };

    const mockAssignedUser = {
      id: 'assigned-user-123',
      organizationId: mockOrganizationId,
      isActive: true
    };

    const mockCreatedProject = {
      id: 'project-123',
      organizationId: mockOrganizationId,
      projectNumber: 'PRJ-1234567890-ABCD',
      ...mockProjectData,
      status: ProjectStatus.QUOTED,
      customer: mockCustomer,
      assignedTo: mockAssignedUser,
      appointments: []
    };

    it('should create a project successfully', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrisma.user.findFirst.mockResolvedValue(mockAssignedUser);
      mockPrisma.project.create.mockResolvedValue(mockCreatedProject);
      mockAuditService.logAction.mockResolvedValue(undefined);

      const result = await service.createProject(mockProjectData, mockOrganizationId, mockAuditContext);

      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockCustomerId,
          organizationId: mockOrganizationId,
          deletedAt: null
        }
      });

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'assigned-user-123',
          organizationId: mockOrganizationId,
          isActive: true
        }
      });

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: mockOrganizationId,
          projectNumber: expect.stringMatching(/^PRJ-\d+-[A-Z0-9]+$/),
          customerId: mockCustomerId,
          name: 'Test Project',
          status: ProjectStatus.QUOTED,
          priority: 3
        }),
        include: expect.any(Object)
      });

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'CREATE',
        entityType: 'Project',
        entityId: mockCreatedProject.id,
        changes: { project: mockCreatedProject },
        context: {
          organizationId: mockOrganizationId,
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });

      expect(result).toEqual(mockCreatedProject);
    });

    it('should throw error if customer not found', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.createProject(mockProjectData, mockOrganizationId, mockAuditContext)
      ).rejects.toThrow('Customer not found');
    });

    it('should throw error if assigned user not found', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createProject(mockProjectData, mockOrganizationId, mockAuditContext)
      ).rejects.toThrow('Assigned user not found or inactive');
    });

    it('should create project without assigned user', async () => {
      const projectDataWithoutAssignment = { ...mockProjectData, assignedToId: undefined };

      mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrisma.project.create.mockResolvedValue(mockCreatedProject);
      mockAuditService.logAction.mockResolvedValue(undefined);

      const result = await service.createProject(
        projectDataWithoutAssignment,
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual(mockCreatedProject);
    });
  });

  describe('getProject', () => {
    const mockProjectId = 'project-123';
    const mockProject = {
      id: mockProjectId,
      name: 'Test Project',
      organizationId: mockOrganizationId,
      customer: { id: mockCustomerId },
      assignedTo: { id: 'user-123' },
      appointments: []
    };

    it('should return project if found', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);

      const result = await service.getProject(mockProjectId, mockOrganizationId);

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockProjectId,
          organizationId: mockOrganizationId,
          deletedAt: null
        },
        include: expect.any(Object)
      });

      expect(result).toEqual(mockProject);
    });

    it('should return null if project not found', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const result = await service.getProject(mockProjectId, mockOrganizationId);

      expect(result).toBeNull();
    });
  });

  describe('updateProject', () => {
    const mockProjectId = 'project-123';
    const mockExistingProject = {
      id: mockProjectId,
      status: ProjectStatus.QUOTED,
      organizationId: mockOrganizationId
    };

    const mockUpdateData = {
      name: 'Updated Project Name',
      status: ProjectStatus.IN_PROGRESS,
      assignedToId: 'new-user-123'
    };

    const mockAssignedUser = {
      id: 'new-user-123',
      organizationId: mockOrganizationId,
      isActive: true
    };

    const mockUpdatedProject = {
      ...mockExistingProject,
      ...mockUpdateData
    };

    beforeEach(() => {
      service.getProject = jest.fn().mockResolvedValue(mockExistingProject);
    });

    it('should update project successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAssignedUser);
      mockPrisma.project.update.mockResolvedValue(mockUpdatedProject);
      mockAuditService.logAction.mockResolvedValue(undefined);

      const result = await service.updateProject(
        mockProjectId,
        mockUpdateData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: mockProjectId },
        data: expect.objectContaining({
          name: 'Updated Project Name',
          status: ProjectStatus.IN_PROGRESS,
          assignedToId: 'new-user-123',
          actualStartDate: expect.any(Date)
        })
      });

      expect(result).toEqual(mockUpdatedProject);
    });

    it('should set actualStartDate when moving to IN_PROGRESS', async () => {
      const updateData = { status: ProjectStatus.IN_PROGRESS };

      mockPrisma.project.update.mockResolvedValue(mockUpdatedProject);
      mockAuditService.logAction.mockResolvedValue(undefined);

      await service.updateProject(
        mockProjectId,
        updateData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: mockProjectId },
        data: expect.objectContaining({
          status: ProjectStatus.IN_PROGRESS,
          actualStartDate: expect.any(Date)
        })
      });
    });

    it('should set completedAt when project is completed', async () => {
      const updateData = { status: ProjectStatus.COMPLETED };

      mockPrisma.project.update.mockResolvedValue(mockUpdatedProject);
      mockAuditService.logAction.mockResolvedValue(undefined);

      await service.updateProject(
        mockProjectId,
        updateData,
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: mockProjectId },
        data: expect.objectContaining({
          status: ProjectStatus.COMPLETED,
          completedAt: expect.any(Date),
          actualEndDate: expect.any(Date)
        })
      });
    });

    it('should throw error if project not found', async () => {
      service.getProject = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateProject(mockProjectId, mockUpdateData, mockOrganizationId, mockAuditContext)
      ).rejects.toThrow('Project not found');
    });
  });

  describe('authorizeWork', () => {
    const mockAuthData = {
      projectId: 'project-123',
      authorizedBy: 'John Manager',
      scopeOfWork: 'Complete website redesign',
      estimatedCost: 5000,
      timeframe: '4 weeks',
      terms: 'Payment in 2 installments',
      notes: 'High priority project'
    };

    const mockProject = {
      id: 'project-123',
      status: ProjectStatus.QUOTED,
      description: 'Existing description'
    };

    const mockUpdatedProject = {
      ...mockProject,
      status: ProjectStatus.APPROVED
    };

    beforeEach(() => {
      service.getProject = jest.fn().mockResolvedValue(mockProject);
      service.updateProject = jest.fn().mockResolvedValue(mockUpdatedProject);
    });

    it('should authorize work successfully', async () => {
      mockAuditService.logAction.mockResolvedValue(undefined);

      const result = await service.authorizeWork(mockAuthData, mockOrganizationId, mockAuditContext);

      expect(service.updateProject).toHaveBeenCalledWith(
        mockAuthData.projectId,
        expect.objectContaining({
          status: ProjectStatus.APPROVED,
          description: expect.stringContaining('Work Authorization:')
        }),
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'AUTHORIZE',
        entityType: 'Project',
        entityId: mockAuthData.projectId,
        changes: {
          workAuthorization: mockAuthData,
          previousStatus: ProjectStatus.QUOTED,
          newStatus: ProjectStatus.APPROVED
        },
        context: {
          organizationId: mockOrganizationId,
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });

      expect(result).toEqual(mockUpdatedProject);
    });

    it('should throw error if project not found', async () => {
      service.getProject = jest.fn().mockResolvedValue(null);

      await expect(
        service.authorizeWork(mockAuthData, mockOrganizationId, mockAuditContext)
      ).rejects.toThrow('Project not found');
    });
  });

  describe('startProject', () => {
    const mockProjectId = 'project-123';
    const mockProject = {
      id: mockProjectId,
      status: ProjectStatus.APPROVED
    };

    beforeEach(() => {
      service.getProject = jest.fn().mockResolvedValue(mockProject);
      service.updateProject = jest.fn();
    });

    it('should start project successfully', async () => {
      const mockStartedProject = { ...mockProject, status: ProjectStatus.IN_PROGRESS };
      service.updateProject = jest.fn().mockResolvedValue(mockStartedProject);

      const result = await service.startProject(mockProjectId, mockOrganizationId, mockAuditContext);

      expect(service.updateProject).toHaveBeenCalledWith(
        mockProjectId,
        {
          status: ProjectStatus.IN_PROGRESS,
          actualStartDate: expect.any(Date)
        },
        mockOrganizationId,
        mockAuditContext
      );

      expect(result).toEqual(mockStartedProject);
    });

    it('should throw error if project is not approved', async () => {
      const unapprovedProject = { ...mockProject, status: ProjectStatus.QUOTED };
      service.getProject = jest.fn().mockResolvedValue(unapprovedProject);

      await expect(
        service.startProject(mockProjectId, mockOrganizationId, mockAuditContext)
      ).rejects.toThrow('Project must be approved before it can be started');
    });
  });

  describe('completeProject', () => {
    const mockProjectId = 'project-123';
    const mockProject = {
      id: mockProjectId,
      status: ProjectStatus.IN_PROGRESS,
      actualHours: 35
    };

    beforeEach(() => {
      service.getProject = jest.fn().mockResolvedValue(mockProject);
      service.updateProject = jest.fn();
    });

    it('should complete project successfully', async () => {
      const mockCompletedProject = { ...mockProject, status: ProjectStatus.COMPLETED };
      service.updateProject = jest.fn().mockResolvedValue(mockCompletedProject);

      const result = await service.completeProject(
        mockProjectId,
        40,
        mockOrganizationId,
        mockAuditContext
      );

      expect(service.updateProject).toHaveBeenCalledWith(
        mockProjectId,
        {
          status: ProjectStatus.COMPLETED,
          actualHours: 40,
          actualEndDate: expect.any(Date)
        },
        mockOrganizationId,
        mockAuditContext
      );

      expect(result).toEqual(mockCompletedProject);
    });

    it('should use existing actual hours if not provided', async () => {
      const mockCompletedProject = { ...mockProject, status: ProjectStatus.COMPLETED };
      service.updateProject = jest.fn().mockResolvedValue(mockCompletedProject);

      await service.completeProject(mockProjectId, undefined, mockOrganizationId, mockAuditContext);

      expect(service.updateProject).toHaveBeenCalledWith(
        mockProjectId,
        {
          status: ProjectStatus.COMPLETED,
          actualHours: 35,
          actualEndDate: expect.any(Date)
        },
        mockOrganizationId,
        mockAuditContext
      );
    });

    it('should throw error for invalid project status', async () => {
      const invalidProject = { ...mockProject, status: ProjectStatus.COMPLETED };
      service.getProject = jest.fn().mockResolvedValue(invalidProject);

      await expect(
        service.completeProject(mockProjectId, 40, mockOrganizationId, mockAuditContext)
      ).rejects.toThrow('Only in-progress or on-hold projects can be completed');
    });
  });

  describe('updateTimeTracking', () => {
    const mockProjectId = 'project-123';
    const mockProject = {
      id: mockProjectId,
      actualHours: 20
    };

    beforeEach(() => {
      service.getProject = jest.fn().mockResolvedValue(mockProject);
      service.updateProject = jest.fn();
    });

    it('should update time tracking successfully', async () => {
      const mockUpdatedProject = { ...mockProject, actualHours: 25 };
      service.updateProject = jest.fn().mockResolvedValue(mockUpdatedProject);
      mockAuditService.logAction.mockResolvedValue(undefined);

      const result = await service.updateTimeTracking(
        mockProjectId,
        5,
        mockOrganizationId,
        mockAuditContext
      );

      expect(service.updateProject).toHaveBeenCalledWith(
        mockProjectId,
        { actualHours: 25 },
        mockOrganizationId,
        mockAuditContext
      );

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'UPDATE',
        entityType: 'Project',
        entityId: mockProjectId,
        changes: {
          timeTracking: {
            hoursAdded: 5,
            previousHours: 20,
            newTotalHours: 25
          }
        },
        context: {
          organizationId: mockOrganizationId,
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });

      expect(result).toEqual(mockUpdatedProject);
    });

    it('should handle null actual hours', async () => {
      const projectWithNullHours = { ...mockProject, actualHours: null };
      service.getProject = jest.fn().mockResolvedValue(projectWithNullHours);

      const mockUpdatedProject = { ...projectWithNullHours, actualHours: 5 };
      service.updateProject = jest.fn().mockResolvedValue(mockUpdatedProject);
      mockAuditService.logAction.mockResolvedValue(undefined);

      await service.updateTimeTracking(mockProjectId, 5, mockOrganizationId, mockAuditContext);

      expect(service.updateProject).toHaveBeenCalledWith(
        mockProjectId,
        { actualHours: 5 },
        mockOrganizationId,
        mockAuditContext
      );
    });
  });

  describe('listProjects', () => {
    const mockProjects = [
      { id: 'project-1', name: 'Project 1' },
      { id: 'project-2', name: 'Project 2' }
    ];

    it('should list projects with default pagination', async () => {
      mockPrisma.project.findMany.mockResolvedValue(mockProjects);
      mockPrisma.project.count.mockResolvedValue(2);

      const result = await service.listProjects(mockOrganizationId);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrganizationId,
          deletedAt: null
        },
        include: expect.any(Object),
        orderBy: [
          { priority: 'asc' },
          { createdAt: 'desc' }
        ],
        skip: 0,
        take: 50
      });

      expect(result).toEqual({
        projects: mockProjects,
        total: 2,
        page: 1,
        totalPages: 1
      });
    });

    it('should apply filters correctly', async () => {
      const filter = {
        customerId: 'customer-123',
        status: ProjectStatus.IN_PROGRESS,
        search: 'test'
      };

      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.count.mockResolvedValue(0);

      await service.listProjects(mockOrganizationId, filter, 2, 25);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrganizationId,
          deletedAt: null,
          customerId: 'customer-123',
          status: ProjectStatus.IN_PROGRESS,
          OR: [
            { name: { contains: 'test', mode: 'insensitive' } },
            { description: { contains: 'test', mode: 'insensitive' } },
            { projectNumber: { contains: 'test', mode: 'insensitive' } }
          ]
        },
        include: expect.any(Object),
        orderBy: expect.any(Object),
        skip: 25,
        take: 25
      });
    });
  });

  describe('deleteProject', () => {
    const mockProjectId = 'project-123';
    const mockProject = {
      id: mockProjectId,
      name: 'Test Project'
    };

    beforeEach(() => {
      service.getProject = jest.fn().mockResolvedValue(mockProject);
    });

    it('should soft delete project successfully', async () => {
      mockPrisma.project.update.mockResolvedValue({});
      mockAuditService.logAction.mockResolvedValue(undefined);

      await service.deleteProject(mockProjectId, mockOrganizationId, mockAuditContext);

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: mockProjectId },
        data: { deletedAt: expect.any(Date) }
      });

      expect(mockAuditService.logAction).toHaveBeenCalledWith({
        action: 'DELETE',
        entityType: 'Project',
        entityId: mockProjectId,
        changes: { deletedProject: mockProject },
        context: {
          organizationId: mockOrganizationId,
          userId: mockUserId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      });
    });

    it('should throw error if project not found', async () => {
      service.getProject = jest.fn().mockResolvedValue(null);

      await expect(
        service.deleteProject(mockProjectId, mockOrganizationId, mockAuditContext)
      ).rejects.toThrow('Project not found');
    });
  });
});