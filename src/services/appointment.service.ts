import { PrismaClient, Appointment } from '@prisma/client';
import { auditService } from './audit.service';

const prisma = new PrismaClient();

interface CreateAppointmentData {
  customerId: string;
  projectId?: string;
  locationId?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  duration: number;
}

interface UpdateAppointmentData {
  title?: string;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  locationId?: string;
}

interface AppointmentFilters {
  customerId?: string;
  projectId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
  confirmed?: boolean;
  completed?: boolean;
  cancelled?: boolean;
  limit?: number;
  offset?: number;
}

export class AppointmentService {
  async createAppointment(
    data: CreateAppointmentData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Appointment & { customer?: any; project?: any; location?: any }> {
    // Verify customer exists and belongs to organization
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, organizationId, deletedAt: null }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Verify project exists if provided
    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, organizationId, deletedAt: null }
      });
      if (!project) {
        throw new Error('Project not found');
      }
    }

    // Verify location exists if provided
    if (data.locationId) {
      const location = await prisma.location.findFirst({
        where: { id: data.locationId, organizationId, deletedAt: null }
      });
      if (!location) {
        throw new Error('Location not found');
      }
    }

    // Validate appointment times
    if (data.startTime >= data.endTime) {
      throw new Error('Start time must be before end time');
    }

    if (data.startTime < new Date()) {
      throw new Error('Appointment cannot be scheduled in the past');
    }

    // Check for conflicts
    const conflictingAppointment = await this.checkForConflicts(
      organizationId,
      data.startTime,
      data.endTime
    );

    if (conflictingAppointment) {
      throw new Error('Appointment time conflicts with existing appointment');
    }

    const appointment = await prisma.appointment.create({
      data: {
        organizationId,
        customerId: data.customerId,
        projectId: data.projectId,
        locationId: data.locationId,
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        project: true,
        location: true
      }
    });

    await auditService.logCreate(
      'Appointment',
      appointment.id,
      appointment,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return appointment;
  }

  async getAppointment(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<(Appointment & { customer?: any; project?: any; location?: any }) | null> {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
        customer: {
          include: {
            person: true,
            business: true
          }
        },
        project: true,
        location: true
      }
    });

    if (appointment) {
      await auditService.logView(
        'Appointment',
        appointment.id,
        {
          organizationId,
          userId: auditContext.userId,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        }
      );
    }

    return appointment;
  }

  async updateAppointment(
    id: string,
    data: UpdateAppointmentData,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Appointment> {
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!existingAppointment) {
      throw new Error('Appointment not found');
    }

    if (existingAppointment.cancelled) {
      throw new Error('Cannot update cancelled appointment');
    }

    if (existingAppointment.completed) {
      throw new Error('Cannot update completed appointment');
    }

    // Validate appointment times if being updated
    if (data.startTime || data.endTime) {
      const startTime = data.startTime || existingAppointment.startTime;
      const endTime = data.endTime || existingAppointment.endTime;

      if (startTime >= endTime) {
        throw new Error('Start time must be before end time');
      }

      if (startTime < new Date()) {
        throw new Error('Appointment cannot be scheduled in the past');
      }

      // Check for conflicts (excluding current appointment)
      const conflictingAppointment = await this.checkForConflicts(
        organizationId,
        startTime,
        endTime,
        id
      );

      if (conflictingAppointment) {
        throw new Error('Appointment time conflicts with existing appointment');
      }
    }

    // Verify location exists if being updated
    if (data.locationId) {
      const location = await prisma.location.findFirst({
        where: { id: data.locationId, organizationId, deletedAt: null }
      });
      if (!location) {
        throw new Error('Location not found');
      }
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Appointment',
      id,
      existingAppointment,
      updatedAppointment,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedAppointment;
  }

  async listAppointments(
    filters: AppointmentFilters,
    organizationId: string
  ): Promise<{ appointments: (Appointment & { customer?: any; project?: any; location?: any })[]; total: number }> {
    const where: any = { organizationId };

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.locationId) {
      where.locationId = filters.locationId;
    }

    if (filters.confirmed !== undefined) {
      where.confirmed = filters.confirmed;
    }

    if (filters.completed !== undefined) {
      where.completed = filters.completed;
    }

    if (filters.cancelled !== undefined) {
      where.cancelled = filters.cancelled;
    }

    if (filters.startDate || filters.endDate) {
      where.startTime = {};
      if (filters.startDate) {
        where.startTime.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.startTime.lte = new Date(filters.endDate);
      }
    }

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: { startTime: 'asc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: {
          customer: {
            include: {
              person: true,
              business: true
            }
          },
          project: true,
          location: true
        }
      }),
      prisma.appointment.count({ where })
    ]);

    return { appointments, total };
  }

  async confirmAppointment(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Appointment> {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.cancelled) {
      throw new Error('Cannot confirm cancelled appointment');
    }

    if (appointment.completed) {
      throw new Error('Cannot confirm completed appointment');
    }

    if (appointment.confirmed) {
      return appointment;
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        confirmed: true,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Appointment',
      id,
      appointment,
      updatedAppointment,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedAppointment;
  }

  async completeAppointment(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    notes?: string
  ): Promise<Appointment> {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.cancelled) {
      throw new Error('Cannot complete cancelled appointment');
    }

    if (appointment.completed) {
      return appointment;
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        completed: true,
        description: notes ? `${appointment.description || ''}\n\nCompletion Notes: ${notes}`.trim() : appointment.description,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Appointment',
      id,
      appointment,
      updatedAppointment,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedAppointment;
  }

  async cancelAppointment(
    id: string,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string },
    cancellationReason?: string
  ): Promise<Appointment> {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.cancelled) {
      return appointment;
    }

    if (appointment.completed) {
      throw new Error('Cannot cancel completed appointment');
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        cancelled: true,
        cancellationReason,
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Appointment',
      id,
      appointment,
      updatedAppointment,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedAppointment;
  }

  async rescheduleAppointment(
    id: string,
    newStartTime: Date,
    newEndTime: Date,
    organizationId: string,
    auditContext: { userId: string; ipAddress?: string; userAgent?: string }
  ): Promise<Appointment> {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.cancelled) {
      throw new Error('Cannot reschedule cancelled appointment');
    }

    if (appointment.completed) {
      throw new Error('Cannot reschedule completed appointment');
    }

    // Validate new times
    if (newStartTime >= newEndTime) {
      throw new Error('Start time must be before end time');
    }

    if (newStartTime < new Date()) {
      throw new Error('Appointment cannot be scheduled in the past');
    }

    // Check for conflicts
    const conflictingAppointment = await this.checkForConflicts(
      organizationId,
      newStartTime,
      newEndTime,
      id
    );

    if (conflictingAppointment) {
      throw new Error('New appointment time conflicts with existing appointment');
    }

    const duration = Math.round((newEndTime.getTime() - newStartTime.getTime()) / 60000);

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        startTime: newStartTime,
        endTime: newEndTime,
        duration,
        confirmed: false, // Reschedule requires re-confirmation
        updatedAt: new Date()
      }
    });

    await auditService.logUpdate(
      'Appointment',
      id,
      appointment,
      updatedAppointment,
      {
        organizationId,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }
    );

    return updatedAppointment;
  }

  async getAppointmentStats(
    organizationId: string,
    customerId?: string
  ): Promise<any> {
    const where: any = { organizationId };
    if (customerId) {
      where.customerId = customerId;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
      upcomingAppointments,
      recentAppointments
    ] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.count({ where: { ...where, confirmed: true } }),
      prisma.appointment.count({ where: { ...where, completed: true } }),
      prisma.appointment.count({ where: { ...where, cancelled: true } }),
      prisma.appointment.count({
        where: { ...where, startTime: { gte: now }, cancelled: false }
      }),
      prisma.appointment.count({
        where: { ...where, createdAt: { gte: thirtyDaysAgo } }
      })
    ]);

    return {
      total: totalAppointments,
      confirmed: confirmedAppointments,
      completed: completedAppointments,
      cancelled: cancelledAppointments,
      upcoming: upcomingAppointments,
      recent: recentAppointments,
      confirmationRate: totalAppointments > 0 ? (confirmedAppointments / totalAppointments) * 100 : 0,
      completionRate: confirmedAppointments > 0 ? (completedAppointments / confirmedAppointments) * 100 : 0,
      cancellationRate: totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0
    };
  }

  private async checkForConflicts(
    organizationId: string,
    startTime: Date,
    endTime: Date,
    excludeAppointmentId?: string
  ): Promise<Appointment | null> {
    const where: any = {
      organizationId,
      cancelled: false,
      OR: [
        {
          AND: [
            { startTime: { lte: startTime } },
            { endTime: { gt: startTime } }
          ]
        },
        {
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gte: endTime } }
          ]
        },
        {
          AND: [
            { startTime: { gte: startTime } },
            { endTime: { lte: endTime } }
          ]
        }
      ]
    };

    if (excludeAppointmentId) {
      where.id = { not: excludeAppointmentId };
    }

    return prisma.appointment.findFirst({ where });
  }
}

export const appointmentService = new AppointmentService();