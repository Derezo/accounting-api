import prisma from '@/config/database';
import { MaintenanceWindow } from '@prisma/client';

/**
 * @typedef {Object} MaintenanceTask
 * @property {string} id - Task ID
 * @property {string} description - Task description
 * @property {'PENDING'|'IN_PROGRESS'|'COMPLETED'|'FAILED'} status - Task status
 * @property {string} [assignedTo] - User ID assigned to task
 * @property {string} [completedAt] - ISO 8601 completion timestamp
 */

export interface MaintenanceTask {
  id: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  assignedTo?: string;
  completedAt?: string;
}

export interface CreateMaintenanceWindowInput {
  title: string;
  description: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedServices: string[];
  notifyUsers: boolean;
  tasks: Array<{ description: string; assignedTo?: string }>;
  notes?: string;
  createdBy: string;
}

export interface UpdateMaintenanceWindowInput {
  title?: string;
  description?: string;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  impact?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedServices?: string[];
  notifyUsers?: boolean;
  tasks?: Array<{ description: string; assignedTo?: string }>;
  notes?: string;
}

/**
 * Service class for managing maintenance windows
 */
class MaintenanceWindowService {
  /**
   * List all maintenance windows with optional filtering
   *
   * @param {Object} filters - Filter options
   * @param {string} [filters.status] - Filter by status (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED)
   * @param {Date} [filters.startDate] - Filter by scheduled start date (>=)
   * @param {Date} [filters.endDate] - Filter by scheduled start date (<=)
   * @param {number} [filters.limit] - Maximum number of results
   * @param {number} [filters.offset] - Offset for pagination
   * @returns {Promise<{windows: MaintenanceWindow[], total: number}>} List of maintenance windows and total count
   */
  async listMaintenanceWindows(filters: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ windows: MaintenanceWindow[]; total: number }> {
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.scheduledStart = {};
      if (filters.startDate) {
        where.scheduledStart.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.scheduledStart.lte = filters.endDate;
      }
    }

    const [windows, total] = await Promise.all([
      prisma.maintenanceWindow.findMany({
        where,
        orderBy: { scheduledStart: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      prisma.maintenanceWindow.count({ where }),
    ]);

    return { windows, total };
  }

  /**
   * Get maintenance window by ID
   *
   * @param {string} id - Maintenance window ID
   * @returns {Promise<MaintenanceWindow|null>} Maintenance window or null if not found
   */
  async getMaintenanceWindowById(id: string): Promise<MaintenanceWindow | null> {
    return await prisma.maintenanceWindow.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new maintenance window
   *
   * @param {CreateMaintenanceWindowInput} data - Maintenance window data
   * @returns {Promise<MaintenanceWindow>} Created maintenance window
   */
  async createMaintenanceWindow(data: CreateMaintenanceWindowInput): Promise<MaintenanceWindow> {
    // Calculate duration in minutes
    const duration = Math.round(
      (data.scheduledEnd.getTime() - data.scheduledStart.getTime()) / (1000 * 60)
    );

    // Convert tasks to MaintenanceTask format with generated IDs and PENDING status
    const tasks: MaintenanceTask[] = data.tasks.map((task) => ({
      id: this.generateTaskId(),
      description: task.description,
      status: 'PENDING',
      assignedTo: task.assignedTo,
    }));

    const maintenanceWindow = await prisma.maintenanceWindow.create({
      data: {
        title: data.title,
        description: data.description,
        scheduledStart: data.scheduledStart,
        scheduledEnd: data.scheduledEnd,
        duration,
        impact: data.impact,
        affectedServices: JSON.stringify(data.affectedServices),
        notifyUsers: data.notifyUsers,
        tasks: JSON.stringify(tasks),
        notes: data.notes,
        createdBy: data.createdBy,
      },
    });

    // TODO: Send notifications if notifyUsers is true
    if (data.notifyUsers) {
      await this.sendMaintenanceNotification(maintenanceWindow, 'SCHEDULED');
    }

    return maintenanceWindow;
  }

  /**
   * Update an existing maintenance window
   *
   * @param {string} id - Maintenance window ID
   * @param {UpdateMaintenanceWindowInput} data - Updated data
   * @returns {Promise<MaintenanceWindow>} Updated maintenance window
   * @throws {Error} If window not found or in invalid state for update
   */
  async updateMaintenanceWindow(
    id: string,
    data: UpdateMaintenanceWindowInput
  ): Promise<MaintenanceWindow> {
    const existing = await this.getMaintenanceWindowById(id);

    if (!existing) {
      throw new Error('Maintenance window not found');
    }

    // Prevent updates to completed or cancelled windows
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new Error(`Cannot update maintenance window in ${existing.status} state`);
    }

    const updateData: any = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.scheduledStart !== undefined) updateData.scheduledStart = data.scheduledStart;
    if (data.scheduledEnd !== undefined) updateData.scheduledEnd = data.scheduledEnd;
    if (data.impact !== undefined) updateData.impact = data.impact;
    if (data.notifyUsers !== undefined) updateData.notifyUsers = data.notifyUsers;
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (data.affectedServices !== undefined) {
      updateData.affectedServices = JSON.stringify(data.affectedServices);
    }

    if (data.tasks !== undefined) {
      const existingTasks: MaintenanceTask[] = JSON.parse(existing.tasks);
      const updatedTasks: MaintenanceTask[] = data.tasks.map((task, index) => {
        // Preserve existing task ID and status if updating existing task
        const existingTask = existingTasks[index];
        return {
          id: existingTask?.id || this.generateTaskId(),
          description: task.description,
          status: existingTask?.status || 'PENDING',
          assignedTo: task.assignedTo,
          completedAt: existingTask?.completedAt,
        };
      });
      updateData.tasks = JSON.stringify(updatedTasks);
    }

    // Recalculate duration if schedule changed
    if (data.scheduledStart || data.scheduledEnd) {
      const startTime = data.scheduledStart || existing.scheduledStart;
      const endTime = data.scheduledEnd || existing.scheduledEnd;
      updateData.duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    }

    return await prisma.maintenanceWindow.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Start a maintenance window
   *
   * @param {string} id - Maintenance window ID
   * @returns {Promise<MaintenanceWindow>} Updated maintenance window
   * @throws {Error} If window not found or not in PLANNED state
   */
  async startMaintenanceWindow(id: string): Promise<MaintenanceWindow> {
    const existing = await this.getMaintenanceWindowById(id);

    if (!existing) {
      throw new Error('Maintenance window not found');
    }

    if (existing.status !== 'PLANNED') {
      throw new Error(`Cannot start maintenance window in ${existing.status} state`);
    }

    const maintenanceWindow = await prisma.maintenanceWindow.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        actualStart: new Date(),
      },
    });

    // Send notification
    if (existing.notifyUsers) {
      await this.sendMaintenanceNotification(maintenanceWindow, 'STARTED');
    }

    return maintenanceWindow;
  }

  /**
   * Complete a maintenance window
   *
   * @param {string} id - Maintenance window ID
   * @param {string} [completionNotes] - Optional completion notes
   * @returns {Promise<MaintenanceWindow>} Updated maintenance window
   * @throws {Error} If window not found or not in IN_PROGRESS state
   */
  async completeMaintenanceWindow(
    id: string,
    completionNotes?: string
  ): Promise<MaintenanceWindow> {
    const existing = await this.getMaintenanceWindowById(id);

    if (!existing) {
      throw new Error('Maintenance window not found');
    }

    if (existing.status !== 'IN_PROGRESS') {
      throw new Error(`Cannot complete maintenance window in ${existing.status} state`);
    }

    // Mark all pending/in-progress tasks as completed
    const tasks: MaintenanceTask[] = JSON.parse(existing.tasks);
    const now = new Date().toISOString();
    const completedTasks = tasks.map((task) => ({
      ...task,
      status: task.status === 'FAILED' ? 'FAILED' : ('COMPLETED' as const),
      completedAt: task.completedAt || now,
    }));

    const maintenanceWindow = await prisma.maintenanceWindow.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        actualEnd: new Date(),
        completionNotes,
        tasks: JSON.stringify(completedTasks),
      },
    });

    // Send notification
    if (existing.notifyUsers) {
      await this.sendMaintenanceNotification(maintenanceWindow, 'COMPLETED');
    }

    return maintenanceWindow;
  }

  /**
   * Cancel a maintenance window
   *
   * @param {string} id - Maintenance window ID
   * @param {string} [reason] - Cancellation reason
   * @returns {Promise<MaintenanceWindow>} Updated maintenance window
   * @throws {Error} If window not found or already completed/cancelled
   */
  async cancelMaintenanceWindow(id: string, reason?: string): Promise<MaintenanceWindow> {
    const existing = await this.getMaintenanceWindowById(id);

    if (!existing) {
      throw new Error('Maintenance window not found');
    }

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new Error(`Cannot cancel maintenance window in ${existing.status} state`);
    }

    const maintenanceWindow = await prisma.maintenanceWindow.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completionNotes: reason,
      },
    });

    // Send notification
    if (existing.notifyUsers) {
      await this.sendMaintenanceNotification(maintenanceWindow, 'CANCELLED');
    }

    return maintenanceWindow;
  }

  /**
   * Update task status within a maintenance window
   *
   * @param {string} windowId - Maintenance window ID
   * @param {string} taskId - Task ID
   * @param {'PENDING'|'IN_PROGRESS'|'COMPLETED'|'FAILED'} status - New task status
   * @returns {Promise<MaintenanceWindow>} Updated maintenance window
   * @throws {Error} If window or task not found
   */
  async updateTaskStatus(
    windowId: string,
    taskId: string,
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  ): Promise<MaintenanceWindow> {
    const existing = await this.getMaintenanceWindowById(windowId);

    if (!existing) {
      throw new Error('Maintenance window not found');
    }

    const tasks: MaintenanceTask[] = JSON.parse(existing.tasks);
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      throw new Error('Task not found');
    }

    tasks[taskIndex].status = status;
    if (status === 'COMPLETED' || status === 'FAILED') {
      tasks[taskIndex].completedAt = new Date().toISOString();
    }

    return await prisma.maintenanceWindow.update({
      where: { id: windowId },
      data: {
        tasks: JSON.stringify(tasks),
      },
    });
  }

  /**
   * Send maintenance notification
   *
   * @param {MaintenanceWindow} window - Maintenance window
   * @param {'SCHEDULED'|'STARTED'|'COMPLETED'|'CANCELLED'} type - Notification type
   * @private
   */
  private async sendMaintenanceNotification(
    window: MaintenanceWindow,
    type: 'SCHEDULED' | 'STARTED' | 'COMPLETED' | 'CANCELLED'
  ): Promise<void> {
    // TODO: Implement notification logic (email, SMS, etc.)
    // This would integrate with existing notification service
    console.log(`Sending ${type} notification for maintenance window: ${window.title}`);
  }

  /**
   * Generate a unique task ID
   *
   * @returns {string} Generated task ID
   * @private
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export default new MaintenanceWindowService();
