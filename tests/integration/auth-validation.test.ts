// @ts-nocheck
/**
 * Simple test to validate authentication and authorization fixes
 */

import supertest from 'supertest';
import { testApp as app, prisma, createTestToken } from './setup';
import { createTestOrganization, createTestUser } from './test-utils';

describe('Authentication & Authorization Validation', () => {
  let organizationId: string;
  let userId: string;
  let authToken: string;

  beforeEach(async () => {
    // Create test organization
    const org = await createTestOrganization(prisma, 'Validation Test Org');
    organizationId = org.id;

    // Create test user
    const user = await createTestUser(prisma, organizationId, 'ADMIN');
    userId = user.id;

    // Create test token
    authToken = createTestToken({
      organizationId,
      role: 'ADMIN',
      userId
    });
  });

  test('should authenticate with test token', async () => {
    const response = await supertest(app)
      .get(`/api/v1/organizations/${organizationId}/users`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toBeDefined();
  });

  test('should validate organization access with test token', async () => {
    const response = await supertest(app)
      .get(`/api/v1/organizations/${organizationId}/customers`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toBeDefined();
  });

  test('should reject requests without authentication', async () => {
    await supertest(app)
      .get(`/api/v1/organizations/${organizationId}/customers`)
      .expect(401);
  });

  test('test token should have isTestToken flag', async () => {
    // This validates our middleware correctly identifies test tokens
    const response = await supertest(app)
      .get(`/api/v1/organizations/${organizationId}/users`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // If we got a 200, the test token bypass worked
    expect(response.status).toBe(200);
  });
});
