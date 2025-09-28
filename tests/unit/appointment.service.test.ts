import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { appointmentService } from '../../src/services/appointment.service';
import { CustomerTier, CustomerStatus } from '../../src/types/enums';
import { prisma, createTestOrganization, createTestUser, cleanupDatabase } from '../testUtils';

describe('AppointmentService', () => {
  let testUser: any;
  let testOrganization: any;
  let testCustomer: any;
  let testPerson: any;

  beforeEach(async () => {
    await cleanupDatabase();

    testOrganization = await createTestOrganization('Test Org for Appointments');
    testUser = await createTestUser(testOrganization.id, 'appointment@test.com');

    // Create test person
    testPerson = await prisma.person.create({
      data: {
        organizationId: testOrganization.id,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com'
      }
    });

    // Create test customer
    testCustomer = await prisma.customer.create({
      data: {
        organizationId: testOrganization.id,
        customerNumber: 'CUST-000001',
        personId: testPerson.id,
        tier: CustomerTier.PERSONAL,
        status: CustomerStatus.ACTIVE
      }
    });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('createAppointment', () => {
    it('should create a new appointment with valid data', async () => {
      const appointmentData = {
        customerId: testCustomer.id,
        title: 'Initial Consultation',
        description: 'First meeting with the client',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // Tomorrow + 1 hour
        duration: 60
      };

      const auditContext = {
        userId: testUser.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const appointment = await appointmentService.createAppointment(
        appointmentData,
        testOrganization.id,
        auditContext
      );

      expect(appointment).toBeDefined();
      expect(appointment.title).toBe(appointmentData.title);
      expect(appointment.description).toBe(appointmentData.description);
      expect(appointment.customerId).toBe(appointmentData.customerId);
      expect(appointment.duration).toBe(appointmentData.duration);
      expect(appointment.confirmed).toBe(false);
      expect(appointment.cancelled).toBe(false);
      expect(appointment.completed).toBe(false);
      expect(appointment.customer).toBeDefined();
    });

    it('should reject appointment with non-existent customer', async () => {
      const appointmentData = {
        customerId: 'non-existent-customer',
        title: 'Invalid Appointment',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        duration: 60
      };

      const auditContext = { userId: testUser.id };

      await expect(
        appointmentService.createAppointment(appointmentData, testOrganization.id, auditContext)
      ).rejects.toThrow('Customer not found');
    });

    it('should reject appointment in the past', async () => {
      const appointmentData = {
        customerId: testCustomer.id,
        title: 'Past Appointment',
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        endTime: new Date(Date.now() - 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // Yesterday + 1 hour
        duration: 60
      };

      const auditContext = { userId: testUser.id };

      await expect(
        appointmentService.createAppointment(appointmentData, testOrganization.id, auditContext)
      ).rejects.toThrow('Appointment cannot be scheduled in the past');
    });

    it('should reject appointment with invalid time range', async () => {
      const appointmentData = {
        customerId: testCustomer.id,
        title: 'Invalid Time Range',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // Tomorrow + 1 hour
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        duration: 60
      };

      const auditContext = { userId: testUser.id };

      await expect(
        appointmentService.createAppointment(appointmentData, testOrganization.id, auditContext)
      ).rejects.toThrow('Start time must be before end time');
    });

    it('should reject conflicting appointments', async () => {
      const baseTime = Date.now() + 24 * 60 * 60 * 1000;

      // Create first appointment
      const firstAppointment = {
        customerId: testCustomer.id,
        title: 'First Appointment',
        startTime: new Date(baseTime),
        endTime: new Date(baseTime + 60 * 60 * 1000),
        duration: 60
      };

      await appointmentService.createAppointment(
        firstAppointment,
        testOrganization.id,
        { userId: testUser.id }
      );

      // Try to create conflicting appointment
      const conflictingAppointment = {
        customerId: testCustomer.id,
        title: 'Conflicting Appointment',
        startTime: new Date(baseTime + 30 * 60 * 1000), // 30 minutes after first start
        endTime: new Date(baseTime + 90 * 60 * 1000), // 30 minutes after first end
        duration: 60
      };

      await expect(
        appointmentService.createAppointment(
          conflictingAppointment,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Appointment time conflicts with existing appointment');
    });
  });

  describe('getAppointment', () => {
    let testAppointment: any;

    beforeEach(async () => {
      testAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Test Appointment',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should retrieve appointment by id', async () => {
      const appointment = await appointmentService.getAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(appointment).toBeDefined();
      expect(appointment!.id).toBe(testAppointment.id);
      expect(appointment!.title).toBe('Test Appointment');
      expect(appointment!.customer).toBeDefined();
    });

    it('should return null when appointment not found', async () => {
      const appointment = await appointmentService.getAppointment(
        'non-existent-id',
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(appointment).toBeNull();
    });
  });

  describe('updateAppointment', () => {
    let testAppointment: any;

    beforeEach(async () => {
      testAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Test Appointment',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should update appointment title and description', async () => {
      const updateData = {
        title: 'Updated Appointment',
        description: 'Updated description'
      };

      const updatedAppointment = await appointmentService.updateAppointment(
        testAppointment.id,
        updateData,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(updatedAppointment.title).toBe(updateData.title);
      expect(updatedAppointment.description).toBe(updateData.description);
    });

    it('should reject update for non-existent appointment', async () => {
      await expect(
        appointmentService.updateAppointment(
          'non-existent-id',
          { title: 'Updated' },
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Appointment not found');
    });

    it('should reject update for cancelled appointment', async () => {
      // Cancel the appointment first
      await appointmentService.cancelAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id },
        'Test cancellation'
      );

      await expect(
        appointmentService.updateAppointment(
          testAppointment.id,
          { title: 'Updated' },
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot update cancelled appointment');
    });

    it('should reject update for completed appointment', async () => {
      // Complete the appointment first
      await appointmentService.completeAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id },
        'Test completion'
      );

      await expect(
        appointmentService.updateAppointment(
          testAppointment.id,
          { title: 'Updated' },
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot update completed appointment');
    });
  });

  describe('listAppointments', () => {
    beforeEach(async () => {
      const baseTime = Date.now() + 24 * 60 * 60 * 1000;

      // Create multiple appointments
      await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'First Appointment',
          startTime: new Date(baseTime),
          endTime: new Date(baseTime + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Second Appointment',
          startTime: new Date(baseTime + 2 * 60 * 60 * 1000),
          endTime: new Date(baseTime + 3 * 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should list all appointments for organization', async () => {
      const result = await appointmentService.listAppointments(
        {},
        testOrganization.id
      );

      expect(result.appointments).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter appointments by customer', async () => {
      const result = await appointmentService.listAppointments(
        { customerId: testCustomer.id },
        testOrganization.id
      );

      expect(result.appointments).toHaveLength(2);
      expect(result.appointments.every(apt => apt.customerId === testCustomer.id)).toBe(true);
    });

    it('should limit and offset results', async () => {
      const result = await appointmentService.listAppointments(
        { limit: 1, offset: 0 },
        testOrganization.id
      );

      expect(result.appointments).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe('confirmAppointment', () => {
    let testAppointment: any;

    beforeEach(async () => {
      testAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Test Appointment',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should confirm appointment', async () => {
      const confirmedAppointment = await appointmentService.confirmAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(confirmedAppointment.confirmed).toBe(true);
    });

    it('should reject confirmation for cancelled appointment', async () => {
      // Cancel the appointment first
      await appointmentService.cancelAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      await expect(
        appointmentService.confirmAppointment(
          testAppointment.id,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot confirm cancelled appointment');
    });
  });

  describe('completeAppointment', () => {
    let testAppointment: any;

    beforeEach(async () => {
      testAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Test Appointment',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should complete appointment with notes', async () => {
      const completionNotes = 'Meeting went well, discussed project requirements';

      const completedAppointment = await appointmentService.completeAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id },
        completionNotes
      );

      expect(completedAppointment.completed).toBe(true);
      expect(completedAppointment.description).toContain('Completion Notes: ' + completionNotes);
    });

    it('should reject completion for cancelled appointment', async () => {
      // Cancel the appointment first
      await appointmentService.cancelAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      await expect(
        appointmentService.completeAppointment(
          testAppointment.id,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot complete cancelled appointment');
    });
  });

  describe('cancelAppointment', () => {
    let testAppointment: any;

    beforeEach(async () => {
      testAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Test Appointment',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should cancel appointment with reason', async () => {
      const cancellationReason = 'Client requested cancellation';

      const cancelledAppointment = await appointmentService.cancelAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id },
        cancellationReason
      );

      expect(cancelledAppointment.cancelled).toBe(true);
      expect(cancelledAppointment.cancellationReason).toBe(cancellationReason);
    });

    it('should reject cancellation for completed appointment', async () => {
      // Complete the appointment first
      await appointmentService.completeAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      await expect(
        appointmentService.cancelAppointment(
          testAppointment.id,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot cancel completed appointment');
    });
  });

  describe('rescheduleAppointment', () => {
    let testAppointment: any;

    beforeEach(async () => {
      testAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Test Appointment',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should reschedule appointment to new time', async () => {
      const newStartTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // Day after tomorrow
      const newEndTime = new Date(Date.now() + 48 * 60 * 60 * 1000 + 60 * 60 * 1000);

      const rescheduledAppointment = await appointmentService.rescheduleAppointment(
        testAppointment.id,
        newStartTime,
        newEndTime,
        testOrganization.id,
        { userId: testUser.id }
      );

      expect(rescheduledAppointment.startTime.getTime()).toBe(newStartTime.getTime());
      expect(rescheduledAppointment.endTime.getTime()).toBe(newEndTime.getTime());
      expect(rescheduledAppointment.confirmed).toBe(false); // Should require re-confirmation
    });

    it('should reject reschedule to past time', async () => {
      const pastTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pastEndTime = new Date(Date.now() - 24 * 60 * 60 * 1000 + 60 * 60 * 1000);

      await expect(
        appointmentService.rescheduleAppointment(
          testAppointment.id,
          pastTime,
          pastEndTime,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Appointment cannot be scheduled in the past');
    });

    it('should reject reschedule for cancelled appointment', async () => {
      // Cancel the appointment first
      await appointmentService.cancelAppointment(
        testAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      const newStartTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const newEndTime = new Date(Date.now() + 48 * 60 * 60 * 1000 + 60 * 60 * 1000);

      await expect(
        appointmentService.rescheduleAppointment(
          testAppointment.id,
          newStartTime,
          newEndTime,
          testOrganization.id,
          { userId: testUser.id }
        )
      ).rejects.toThrow('Cannot reschedule cancelled appointment');
    });
  });

  describe('getAppointmentStats', () => {
    beforeEach(async () => {
      const baseTime = Date.now() + 24 * 60 * 60 * 1000;

      // Create confirmed appointment
      const confirmedAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Confirmed Appointment',
          startTime: new Date(baseTime),
          endTime: new Date(baseTime + 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await appointmentService.confirmAppointment(
        confirmedAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );

      // Create cancelled appointment
      const cancelledAppointment = await appointmentService.createAppointment(
        {
          customerId: testCustomer.id,
          title: 'Cancelled Appointment',
          startTime: new Date(baseTime + 2 * 60 * 60 * 1000),
          endTime: new Date(baseTime + 3 * 60 * 60 * 1000),
          duration: 60
        },
        testOrganization.id,
        { userId: testUser.id }
      );

      await appointmentService.cancelAppointment(
        cancelledAppointment.id,
        testOrganization.id,
        { userId: testUser.id }
      );
    });

    it('should return appointment statistics', async () => {
      const stats = await appointmentService.getAppointmentStats(testOrganization.id);

      expect(stats.total).toBe(2);
      expect(stats.confirmed).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.confirmationRate).toBe(50);
      expect(stats.cancellationRate).toBe(50);
    });

    it('should return customer-specific statistics', async () => {
      const stats = await appointmentService.getAppointmentStats(
        testOrganization.id,
        testCustomer.id
      );

      expect(stats.total).toBe(2);
      expect(stats.confirmed).toBe(1);
      expect(stats.cancelled).toBe(1);
    });
  });
});