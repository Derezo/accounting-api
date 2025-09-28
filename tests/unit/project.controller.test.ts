import { Response } from 'express';
import { ProjectController } from '../../src/controllers/project.controller';
import { projectService } from '../../src/services/project.service';
import { ProjectStatus } from '../../src/types/enums';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';

// Mock the project service
jest.mock('../../src/services/project.service');

// Mock express-validator
jest.mock('express-validator', () => {
  const createChainableMock = () => {
    const chain = {
      notEmpty: () => chain,
      withMessage: () => chain,
      isUUID: () => chain,
      isLength: () => chain,
      optional: () => chain,
      isISO8601: () => chain,
      isFloat: () => chain,
      isInt: () => chain,
      isIn: () => chain,
      isObject: () => chain
    };
    return chain;
  };

  return {
    validationResult: jest.fn(() => ({
      isEmpty: () => true,
      array: () => []
    })),
    body: jest.fn(() => createChainableMock()),
    param: jest.fn(() => createChainableMock()),
    query: jest.fn(() => createChainableMock())
  };
});

const mockProjectService = projectService as jest.Mocked<typeof projectService>;

describe('ProjectController', () => {
  let controller: ProjectController;
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    controller = new ProjectController();
    mockRequest = {
      user: {
        id: 'user-123',
        organizationId: 'org-123',
        role: 'ADMIN',
        sessionId: 'session-123'
      },
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      body: {},
      params: {},
      query: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    it('should create a project successfully', async () => {
      const projectData = {
        customerId: 'customer-123',
        name: 'Test Project',
        description: 'Test Description',
        priority: 3,
        estimatedHours: 40,
        hourlyRate: 100
      };

      const createdProject = {
        id: 'project-123',
        ...projectData,
        status: ProjectStatus.QUOTED,
        projectNumber: 'PRJ-123456789-ABCD'
      };

      mockRequest.body = projectData;
      mockProjectService.createProject.mockResolvedValue(createdProject);

      await controller.createProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.createProject).toHaveBeenCalledWith(
        projectData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Project created successfully',
        project: createdProject
      });
    });

    it('should handle project creation errors', async () => {
      mockRequest.body = {
        customerId: 'customer-123',
        name: 'Test Project'
      };

      mockProjectService.createProject.mockRejectedValue(new Error('Customer not found'));

      await controller.createProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Failed to create project',
        message: 'Customer not found'
      });
    });
  });

  describe('getProject', () => {
    it('should return a project when found', async () => {
      const mockProject = {
        id: 'project-123',
        name: 'Test Project',
        status: ProjectStatus.QUOTED
      };

      mockRequest.params = { id: 'project-123' };
      mockProjectService.getProject.mockResolvedValue(mockProject);

      await controller.getProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.getProject).toHaveBeenCalledWith('project-123', 'org-123');
      expect(mockResponse.json).toHaveBeenCalledWith({ project: mockProject });
    });

    it('should return 404 when project not found', async () => {
      mockRequest.params = { id: 'invalid-id' };
      mockProjectService.getProject.mockResolvedValue(null);

      await controller.getProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Project not found'
      });
    });

    it('should return 400 when project ID is missing', async () => {
      mockRequest.params = {};

      await controller.getProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Project ID is required'
      });
    });
  });

  describe('updateProject', () => {
    it('should update project successfully', async () => {
      const updateData = {
        name: 'Updated Project Name',
        status: ProjectStatus.IN_PROGRESS
      };

      const updatedProject = {
        id: 'project-123',
        ...updateData
      };

      mockRequest.params = { id: 'project-123' };
      mockRequest.body = updateData;
      mockProjectService.updateProject.mockResolvedValue(updatedProject as any);

      await controller.updateProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.updateProject).toHaveBeenCalledWith(
        'project-123',
        updateData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Project updated successfully',
        project: updatedProject
      });
    });

    it('should handle update errors', async () => {
      mockRequest.params = { id: 'project-123' };
      mockRequest.body = { name: 'Updated Name' };

      mockProjectService.updateProject.mockRejectedValue(new Error('Project not found'));

      await controller.updateProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Failed to update project',
        message: 'Project not found'
      });
    });
  });

  describe('authorizeWork', () => {
    it('should authorize work successfully', async () => {
      const authData = {
        projectId: 'project-123',
        authorizedBy: 'John Manager',
        scopeOfWork: 'Complete website redesign',
        estimatedCost: 5000,
        timeframe: '4 weeks'
      };

      const authorizedProject = {
        id: 'project-123',
        status: ProjectStatus.APPROVED
      };

      mockRequest.body = authData;
      mockProjectService.authorizeWork.mockResolvedValue(authorizedProject as any);

      await controller.authorizeWork(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.authorizeWork).toHaveBeenCalledWith(
        authData,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Work authorization completed successfully',
        project: authorizedProject
      });
    });

    it('should handle authorization errors', async () => {
      const authData = {
        projectId: 'project-123',
        authorizedBy: 'John Manager',
        scopeOfWork: 'Complete website redesign',
        estimatedCost: 5000,
        timeframe: '4 weeks'
      };

      mockRequest.body = authData;
      mockProjectService.authorizeWork.mockRejectedValue(new Error('Project not found'));

      await controller.authorizeWork(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Failed to authorize work',
        message: 'Project not found'
      });
    });
  });

  describe('startProject', () => {
    it('should start project successfully', async () => {
      const startedProject = {
        id: 'project-123',
        status: ProjectStatus.IN_PROGRESS
      };

      mockRequest.params = { id: 'project-123' };
      mockProjectService.startProject.mockResolvedValue(startedProject as any);

      await controller.startProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.startProject).toHaveBeenCalledWith(
        'project-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Project started successfully',
        project: startedProject
      });
    });
  });

  describe('completeProject', () => {
    it('should complete project successfully', async () => {
      const completedProject = {
        id: 'project-123',
        status: ProjectStatus.COMPLETED,
        actualHours: 45
      };

      mockRequest.params = { id: 'project-123' };
      mockRequest.body = { actualHours: 45 };
      mockProjectService.completeProject.mockResolvedValue(completedProject as any);

      await controller.completeProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.completeProject).toHaveBeenCalledWith(
        'project-123',
        45,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Project completed successfully',
        project: completedProject
      });
    });
  });

  describe('updateTimeTracking', () => {
    it('should update time tracking successfully', async () => {
      const updatedProject = {
        id: 'project-123',
        actualHours: 25
      };

      mockRequest.params = { id: 'project-123' };
      mockRequest.body = { hoursWorked: 5 };
      mockProjectService.updateTimeTracking.mockResolvedValue(updatedProject as any);

      await controller.updateTimeTracking(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.updateTimeTracking).toHaveBeenCalledWith(
        'project-123',
        5,
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Time tracking updated successfully',
        project: updatedProject
      });
    });
  });

  describe('listProjects', () => {
    it('should list projects with default pagination', async () => {
      const mockResult = {
        projects: [
          { id: 'project-1', name: 'Project 1' },
          { id: 'project-2', name: 'Project 2' }
        ],
        total: 2,
        page: 1,
        totalPages: 1
      };

      mockProjectService.listProjects.mockResolvedValue(mockResult as any);

      await controller.listProjects(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.listProjects).toHaveBeenCalledWith(
        'org-123',
        {},
        1,
        50
      );

      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should apply query filters correctly', async () => {
      mockRequest.query = {
        customerId: 'customer-123',
        status: ProjectStatus.IN_PROGRESS,
        priority: '3',
        search: 'test',
        page: '2',
        limit: '25'
      };

      const mockResult = {
        projects: [],
        total: 0,
        page: 2,
        totalPages: 0
      };

      mockProjectService.listProjects.mockResolvedValue(mockResult as any);

      await controller.listProjects(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.listProjects).toHaveBeenCalledWith(
        'org-123',
        {
          customerId: 'customer-123',
          status: ProjectStatus.IN_PROGRESS,
          priority: 3,
          search: 'test'
        },
        2,
        25
      );
    });

    it('should handle date filters', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const mockResult = {
        projects: [],
        total: 0,
        page: 1,
        totalPages: 0
      };

      mockProjectService.listProjects.mockResolvedValue(mockResult as any);

      await controller.listProjects(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.listProjects).toHaveBeenCalledWith(
        'org-123',
        {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31')
        },
        1,
        50
      );
    });
  });

  describe('getProjectStats', () => {
    it('should return project statistics', async () => {
      const mockStats = {
        totalProjects: 10,
        projectsByStatus: {
          [ProjectStatus.QUOTED]: 3,
          [ProjectStatus.IN_PROGRESS]: 4,
          [ProjectStatus.COMPLETED]: 3
        },
        projectsByPriority: {
          1: 2,
          2: 3,
          3: 4,
          4: 1
        },
        totalEstimatedHours: 400,
        totalActualHours: 350,
        totalEstimatedValue: 40000,
        averageCompletionTime: 15.5,
        activeProjects: 7,
        overdueTasks: 2
      };

      mockProjectService.getProjectStats.mockResolvedValue(mockStats as any);

      await controller.getProjectStats(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.getProjectStats).toHaveBeenCalledWith(
        'org-123',
        undefined,
        undefined
      );

      expect(mockResponse.json).toHaveBeenCalledWith({ stats: mockStats });
    });

    it('should handle date range filtering for stats', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const mockStats = {
        totalProjects: 5,
        projectsByStatus: {},
        projectsByPriority: {},
        totalEstimatedHours: 200,
        totalActualHours: 180,
        totalEstimatedValue: 20000,
        averageCompletionTime: 12.3,
        activeProjects: 3,
        overdueTasks: 1
      };

      mockProjectService.getProjectStats.mockResolvedValue(mockStats as any);

      await controller.getProjectStats(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.getProjectStats).toHaveBeenCalledWith(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
    });
  });

  describe('assignProject', () => {
    it('should assign project successfully', async () => {
      const assignedProject = {
        id: 'project-123',
        assignedToId: 'user-456'
      };

      mockRequest.params = { id: 'project-123' };
      mockRequest.body = { assignedToId: 'user-456' };
      mockProjectService.assignProject.mockResolvedValue(assignedProject as any);

      await controller.assignProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.assignProject).toHaveBeenCalledWith(
        'project-123',
        'user-456',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Project assigned successfully',
        project: assignedProject
      });
    });

    it('should return 400 when assignedToId is missing', async () => {
      mockRequest.params = { id: 'project-123' };
      mockRequest.body = {};

      await controller.assignProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Assigned user ID is required'
      });
    });
  });

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      mockRequest.params = { id: 'project-123' };
      mockProjectService.deleteProject.mockResolvedValue();

      await controller.deleteProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockProjectService.deleteProject).toHaveBeenCalledWith(
        'project-123',
        'org-123',
        {
          userId: 'user-123',
          ipAddress: '127.0.0.1',
          userAgent: 'test-user-agent'
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Project deleted successfully'
      });
    });

    it('should handle deletion errors', async () => {
      mockRequest.params = { id: 'project-123' };
      mockProjectService.deleteProject.mockRejectedValue(new Error('Project not found'));

      await controller.deleteProject(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Failed to delete project',
        message: 'Project not found'
      });
    });
  });
});