import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import type { DatabaseInstance } from './client/connection.js';

const isStaging =
  process.env.APP_ENV === 'staging' &&
  process.env.STAGING_SMOKE_TESTS === 'true' &&
  Boolean(process.env.DATABASE_URL);

const describeStaging = isStaging ? describe : describe.skip;

describeStaging('Neon Staging Connection & TLS Smoke Test (Opt-In)', () => {
  let db: DatabaseInstance;
  let pool: pg.Pool;

  beforeAll(() => {
    const rawUrl = process.env.DATABASE_URL ?? '';
    try {
      const parsed = new URL(rawUrl);
      if (!parsed.hostname.includes('neon.tech')) {
        throw new Error('Target database is not a verified Neon host.');
      }
    } catch {
      throw new Error('DATABASE_URL is not a valid Neon connection string.');
    }

    const client = createDatabaseConnection({ maxConnections: 2 });
    db = client.db;
    pool = client.pool;
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('connects to managed Neon PostgreSQL and verifies major version is 16', async () => {
    const result = await db.execute<{ version: string }>(sql`SELECT version();`);
    const versionStr = result.rows[0]?.version ?? '';

    expect(versionStr).toContain('PostgreSQL 16');
  });

  it('validates active TLS encryption and CA certificate authorization on connection stream', async () => {
    const client = await pool.connect();
    try {
      const stream = (
        client as unknown as {
          connection: {
            stream: {
              encrypted?: boolean;
              authorized?: boolean;
              getProtocol?: () => string;
            };
          };
        }
      ).connection.stream;

      expect(stream.encrypted).toBe(true);
      expect(stream.authorized).toBe(true);
      expect(stream.getProtocol?.()).toContain('TLS');
    } finally {
      client.release();
    }
  });

  it('queries pg_stat_ssl for the active backend process', async () => {
    const result = await db.execute<{
      ssl: boolean;
      version: string | null;
      cipher: string | null;
    }>(sql`
      SELECT ssl, version, cipher
      FROM pg_stat_ssl
      WHERE pid = pg_backend_pid();
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveProperty('ssl');
  });

  it('verifies all 12 platform tables exist in the public schema', async () => {
    const result = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableNames = new Set(result.rows.map((r) => r.table_name));

    const expectedTables = [
      'user',
      'session',
      'account',
      'verification',
      'organizations',
      'organization_memberships',
      'platform_admin_authorizations',
      'plans',
      'entitlements',
      'subscriptions',
      'commercial_grants',
      'audit_logs',
    ];

    for (const table of expectedTables) {
      expect(tableNames.has(table)).toBe(true);
    }
  });
});
