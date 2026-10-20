import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../client/connection.js';
import { collectTestDatabaseEvidence } from './collect-test-database-evidence.js';
import {
  assertDroppableByThisRun,
  createDisposableTestDatabase,
} from './disposable-test-database.js';
import {
  evaluateTestTargetEvidence,
  resolveTestAdminUrl,
} from './test-database-target-evidence.js';

/** Integração REAL com o PostgreSQL local de testes (sem Docker neste ambiente). */
describe('disposable test database guard against the real local PostgreSQL', () => {
  const adminUrl = resolveTestAdminUrl(process.env);
  const admin = createDatabaseConnection({ connectionString: adminUrl, maxConnections: 1 });

  afterAll(async () => {
    await admin.pool.end();
  });

  async function disposableCount(): Promise<number> {
    const r = await admin.db.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM pg_database WHERE datname LIKE 'of2_test_%'`,
    );
    return Number(r.rows[0]?.n ?? '0');
  }

  it('collects real server evidence and accepts this local target with a recorded mode', async () => {
    const evidence = await collectTestDatabaseEvidence({ adminUrl, db: admin.db });
    expect(evidence.serverVersionNum).toBeGreaterThanOrEqual(160000);
    expect(evidence.canCreateDatabase).toBe(true);
    expect(evaluateTestTargetEvidence(evidence).accepted).toBe(true);
  });

  it('10. a failed verification executes zero DDL (no database is created)', async () => {
    const before = await disposableCount();
    const forged = async () => ({
      clientHost: 'localhost',
      clientPort: 5432,
      serverAddress: '172.18.0.2',
      serverVersionNum: 160015,
      systemIdentifier: '1',
      canCreateDatabase: true,
      docker: { kind: 'UNAVAILABLE' as const },
    });
    await expect(
      createDisposableTestDatabase('guard', { collectEvidence: forged }),
    ).rejects.toThrow(/FORWARDED_TARGET_UNPROVEN.*no DDL executed/);
    expect(await disposableCount()).toBe(before);
  });

  it('11. cleanup only touches the disposable database created by this run', async () => {
    expect(() => assertDroppableByThisRun('voice_agent_dev')).toThrow();
    expect(() => assertDroppableByThisRun('postgres')).toThrow();
    expect(() => assertDroppableByThisRun('of2_test_0123456789ab')).toThrow();
    const tdb = await createDisposableTestDatabase('guard');
    expect(() => assertDroppableByThisRun(tdb.name)).not.toThrow();
    await tdb.drop();
    const left = await admin.db.execute(sql`SELECT 1 FROM pg_database WHERE datname = ${tdb.name}`);
    expect(left.rows).toHaveLength(0);
    expect(() => assertDroppableByThisRun(tdb.name)).toThrow();
  });
});
