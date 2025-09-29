import request from 'supertest';
import { app } from '@/app';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';

const prisma = new PrismaClient();

describe('Enhanced Audit Logging Integration Tests', () => {
  let authToken: string;
  let organizationId: string;
  let userId: string;
  let sessionId: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.auditLog.deleteMany({
      where: { organizationId: { contains: 'test-audit' } }
    });

    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Audit Org',
        type: 'SINGLE_BUSINESS',
        domain: 'test-audit.com'
      }
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email: 'audittest@test.com',
        firstName: 'Audit',
        lastName: 'Tester',
        passwordHash: 'hashedpassword',
        role: 'ADMIN',
        organizationId,
        isActive: true,
        emailVerified: true
      }
    });
    userId = user.id;

    // Create test session
    const session = await prisma.userSession.create({
      data: {
        userId,
        organizationId,
        sessionToken: 'test-session-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        isActive: true,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      }
    });
    sessionId = session.id;

    // Get auth token (mock for testing)
    authToken = 'test-audit-token';
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany({
      where: { organizationId }
    });
    await prisma.userSession.deleteMany({
      where: { organizationId }
    });
    await prisma.user.deleteMany({
      where: { organizationId }
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId }
    });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create some test audit logs for each test
    await prisma.auditLog.createMany({
      data: [
        {
          organizationId,
          userId,
          action: 'LOGIN',
          resourceType: 'User',
          resourceId: userId,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          success: true,
          changes: JSON.stringify({ loginTime: new Date() }),
          createdAt: new Date()
        },
        {
          organizationId,
          userId,
          action: 'CREATE',
          resourceType: 'Customer',
          resourceId: 'test-customer-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          success: true,
          changes: JSON.stringify({ name: 'Test Customer' }),
          createdAt: new Date(Date.now() - 60000) // 1 minute ago
        },
        {
          organizationId,
          userId,
          action: 'VIEW',
          resourceType: 'Document',
          resourceId: 'test-doc-1',
          ipAddress: '192.168.1.100',
          userAgent: 'suspicious-agent',
          success: true,
          changes: JSON.stringify({ viewedAt: new Date() }),
          createdAt: new Date(Date.now() - 120000) // 2 minutes ago
        }
      ]
    });
  });

  describe('User Activity Tracking', () => {
    it('should get user activity logs', async () => {
      const response = await request(app)
        .get(`/api/v1/audit/user-activity/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          limit: 10,
          offset: 0
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('total');
      expect(response.body.activities.length).toBeGreaterThan(0);
      expect(response.body.activities[0]).toHaveProperty('action');
      expect(response.body.activities[0]).toHaveProperty('resourceType');
      expect(response.body.activities[0]).toHaveProperty('ipAddress');
    });

    it('should filter user activities by date range', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const response = await request(app)
        .get(`/api/v1/audit/user-activity/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          limit: 20
        });

      expect(response.status).toBe(200);
      expect(response.body.activities.length).toBeGreaterThan(0);

      // Verify all activities are within date range
      response.body.activities.forEach((activity: any) => {
        const activityDate = new Date(activity.createdAt);
        expect(activityDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(activityDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });

    it('should filter user activities by action type', async () => {
      const response = await request(app)
        .get(`/api/v1/audit/user-activity/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          actions: ['LOGIN', 'CREATE']
        });

      expect(response.status).toBe(200);
      response.body.activities.forEach((activity: any) => {
        expect(['LOGIN', 'CREATE']).toContain(activity.action);
      });
    });

    it('should get user activity summary', async () => {
      const response = await request(app)
        .get(`/api/v1/audit/user-activity/${userId}/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: '24h'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalActivities');
      expect(response.body).toHaveProperty('actionBreakdown');
      expect(response.body).toHaveProperty('resourceBreakdown');
      expect(response.body).toHaveProperty('timeRange');
      expect(response.body.totalActivities).toBeGreaterThan(0);
    });
  });

  describe('Session Management', () => {
    it('should get active sessions', async () => {
      const response = await request(app)
        .get('/api/v1/audit/sessions/active')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('total');
      expect(response.body.sessions.length).toBeGreaterThan(0);
      expect(response.body.sessions[0]).toHaveProperty('sessionToken');
      expect(response.body.sessions[0]).toHaveProperty('ipAddress');
      expect(response.body.sessions[0]).toHaveProperty('userAgent');
    });

    it('should revoke a specific session', async () => {
      const response = await request(app)
        .post(`/api/v1/audit/sessions/${sessionId}/revoke`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'Security test'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('revoked');

      // Verify session is no longer active
      const sessionCheck = await prisma.userSession.findUnique({
        where: { id: sessionId }
      });
      expect(sessionCheck?.isActive).toBe(false);
    });

    it('should revoke all sessions for a user', async () => {
      // Create additional session
      await prisma.userSession.create({
        data: {
          userId,
          organizationId,
          sessionToken: 'additional-session-token',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent-2'
        }
      });

      const response = await request(app)
        .post(`/api/v1/audit/sessions/revoke-all/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'Security sweep'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('revoked');
      expect(response.body.revokedCount).toBeGreaterThan(0);

      // Verify all sessions are revoked
      const activeSessions = await prisma.userSession.count({
        where: {
          userId,
          isActive: true
        }
      });
      expect(activeSessions).toBe(0);
    });
  });

  describe('Suspicious Activity Detection', () => {
    beforeEach(async () => {
      // Create suspicious activity data
      await prisma.auditLog.createMany({
        data: [
          {
            organizationId,
            userId,
            action: 'LOGIN',
            resourceType: 'User',
            resourceId: userId,
            ipAddress: '192.168.1.100', // Different IP
            userAgent: 'suspicious-agent',
            success: false,
            changes: JSON.stringify({ failedLogin: true }),
            createdAt: new Date(Date.now() - 30000)
          },
          {
            organizationId,
            userId,
            action: 'LOGIN',
            resourceType: 'User',
            resourceId: userId,
            ipAddress: '192.168.1.100',
            userAgent: 'suspicious-agent',
            success: false,
            changes: JSON.stringify({ failedLogin: true }),
            createdAt: new Date(Date.now() - 20000)
          },
          {
            organizationId,
            userId,
            action: 'VIEW',
            resourceType: 'Document',
            resourceId: 'sensitive-doc',
            ipAddress: '192.168.1.100',
            userAgent: 'suspicious-agent',
            success: true,
            changes: JSON.stringify({ sensitiveAccess: true }),
            createdAt: new Date(Date.now() - 10000)
          }
        ]
      });
    });

    it('should detect suspicious activities', async () => {
      const response = await request(app)
        .get('/api/v1/audit/suspicious-activity')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: '1h',
          severity: 'medium'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.activities.length).toBeGreaterThan(0);
      expect(response.body.summary).toHaveProperty('totalSuspicious');
      expect(response.body.summary).toHaveProperty('severityBreakdown');
    });

    it('should filter suspicious activities by severity', async () => {
      const response = await request(app)
        .get('/api/v1/audit/suspicious-activity')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          severity: 'high',
          limit: 10
        });

      expect(response.status).toBe(200);
      response.body.activities.forEach((activity: any) => {
        expect(['high', 'critical']).toContain(activity.severity);
      });
    });

    it('should get suspicious activity patterns', async () => {
      const response = await request(app)
        .get('/api/v1/audit/suspicious-activity/patterns')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: '24h'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('patterns');
      expect(response.body).toHaveProperty('riskScore');
      expect(response.body.patterns).toHaveProperty('failedLogins');
      expect(response.body.patterns).toHaveProperty('unusualAccess');
      expect(response.body.patterns).toHaveProperty('ipAnomalies');
    });
  });

  describe('Security Metrics', () => {
    it('should get security metrics overview', async () => {
      const response = await request(app)
        .get('/api/v1/audit/security-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: '24h'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('overview');
      expect(response.body).toHaveProperty('trends');
      expect(response.body).toHaveProperty('alerts');

      expect(response.body.overview).toHaveProperty('totalLogins');
      expect(response.body.overview).toHaveProperty('failedLogins');
      expect(response.body.overview).toHaveProperty('suspiciousActivities');
      expect(response.body.overview).toHaveProperty('activeUsers');
    });

    it('should get login security metrics', async () => {
      const response = await request(app)
        .get('/api/v1/audit/security-metrics/logins')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: '7d',
          groupBy: 'day'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.metrics.length).toBeGreaterThan(0);
      expect(response.body.summary).toHaveProperty('totalLogins');
      expect(response.body.summary).toHaveProperty('successRate');
    });

    it('should get access control metrics', async () => {
      const response = await request(app)
        .get('/api/v1/audit/security-metrics/access-control')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: '24h'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('resourceAccess');
      expect(response.body).toHaveProperty('permissionDenials');
      expect(response.body).toHaveProperty('roleUsage');
      expect(response.body).toHaveProperty('sensitiveOperations');
    });

    it('should get compliance metrics', async () => {
      const response = await request(app)
        .get('/api/v1/audit/security-metrics/compliance')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: '30d'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('auditCoverage');
      expect(response.body).toHaveProperty('dataProtection');
      expect(response.body).toHaveProperty('retentionCompliance');
      expect(response.body).toHaveProperty('encryptionUsage');
    });
  });

  describe('Audit Log Export', () => {
    it('should export audit logs in CSV format', async () => {
      const response = await request(app)
        .get('/api/v1/audit/export/csv')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          actions: ['LOGIN', 'CREATE', 'VIEW']
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('timestamp,userId,action,resourceType');
    });

    it('should export audit logs in JSON format', async () => {
      const response = await request(app)
        .get('/api/v1/audit/export/json')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          includeMetadata: 'true'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toHaveProperty('exportInfo');
      expect(response.body).toHaveProperty('auditLogs');
      expect(response.body.auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Real-time Audit Streaming', () => {
    it('should get real-time audit stream configuration', async () => {
      const response = await request(app)
        .get('/api/v1/audit/stream/config')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('enabled');
      expect(response.body).toHaveProperty('filters');
      expect(response.body).toHaveProperty('format');
    });

    it('should update audit stream configuration', async () => {
      const response = await request(app)
        .put('/api/v1/audit/stream/config')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          enabled: true,
          filters: {
            actions: ['LOGIN', 'CREATE', 'UPDATE', 'DELETE'],
            severity: ['medium', 'high', 'critical']
          },
          format: 'json'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('updated');
    });
  });

  describe('Access Control and Authorization', () => {
    it('should reject unauthorized access to audit endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/audit/user-activity/test-user')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should enforce role-based access to sensitive audit data', async () => {
      // Create a regular user without audit access
      const regularUser = await prisma.user.create({
        data: {
          email: 'regular@test.com',
          firstName: 'Regular',
          lastName: 'User',
          passwordHash: 'hashedpassword',
          role: 'EMPLOYEE',
          organizationId,
          isActive: true,
          emailVerified: true
        }
      });

      const response = await request(app)
        .get('/api/v1/audit/security-metrics')
        .set('Authorization', 'Bearer employee-token');

      expect(response.status).toBe(403);

      // Clean up
      await prisma.user.delete({ where: { id: regularUser.id } });
    });
  });
});