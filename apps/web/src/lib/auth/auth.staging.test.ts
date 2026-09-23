import { describe, it, expect, afterAll } from 'vitest';
import { auth } from './auth.js';
import { createDatabaseConnection } from '@voice-agent/database';

const isStaging =
  process.env.APP_ENV === 'staging' &&
  process.env.STAGING_SMOKE_TESTS === 'true' &&
  Boolean(process.env.DATABASE_URL);

const describeStaging = isStaging ? describe : describe.skip;

describeStaging('Better Auth + Neon Staging Integration Smoke Test', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const testEmail = `staging-smoke-${runId}@example.com`;
  const testPassword = 'Password123!SecureNeon';
  const testName = `Staging Smoke User ${runId}`;
  let createdUserId: string | null = null;

  afterAll(async () => {
    if (createdUserId) {
      const { pool } = createDatabaseConnection({ maxConnections: 1 });
      try {
        await pool.query('DELETE FROM "session" WHERE "user_id" = $1', [createdUserId]);
        await pool.query('DELETE FROM "account" WHERE "user_id" = $1', [createdUserId]);
        await pool.query('DELETE FROM "user" WHERE "id" = $1', [createdUserId]);
      } finally {
        await pool.end();
      }
    }
  });

  it('proves Neon host validation', () => {
    const rawUrl = process.env.DATABASE_URL ?? '';
    const parsed = new URL(rawUrl);
    expect(parsed.hostname).toContain('neon.tech');
  });

  it('registers user in Neon staging, persists credentials, and logs in', async () => {
    const signUpResponse = await auth.api.signUpEmail({
      body: {
        email: testEmail,
        password: testPassword,
        name: testName,
      },
    });

    expect(signUpResponse).toBeDefined();
    expect(signUpResponse.user).toBeDefined();
    expect(signUpResponse.user.email).toBe(testEmail);
    expect(signUpResponse.token).toBeDefined();

    createdUserId = signUpResponse.user.id;

    const signInResponse = await auth.api.signInEmail({
      body: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(signInResponse).toBeDefined();
    expect(signInResponse.user).toBeDefined();
    expect(signInResponse.user.id).toBe(createdUserId);
    expect(signInResponse.token).toBeDefined();
  });
});
