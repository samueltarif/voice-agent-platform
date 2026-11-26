import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, describe, expect, it } from 'vitest';
import { INITIAL_BOOKING_PROTOCOL_STATE } from '@voice-agent/contracts';
import { createDatabaseConnection } from './client/connection.js';
import { runMigrations } from './client/migrate.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCallSessionRepository } from './repositories/call-session-repository.js';
import { schedulingProtocolStates } from './schema/scheduling-protocol-states.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import { insertLegacyOutboundTenant } from './test-support/legacy-schema-fixtures.js';
import { SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
const PREVIOUS_TAG = '0015_scheduling_session_context';

function migrationsUpTo0015(): string {
  const folder = mkdtempSync(join(tmpdir(), 'e2-upgrade-16-'));
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
  const cut = journal.entries.findIndex((entry) => entry.tag === PREVIOUS_TAG);
  writeFileSync(
    journalPath,
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut + 1) }),
  );
  return folder;
}

const previousFolder = migrationsUpTo0015();
const tdb = await createDisposableTestDatabase('scheduling-upgrade-0016', {
  runMigrationsFn: async ({ connectionString }) => {
    const { db, pool } = createDatabaseConnection({ connectionString, maxConnections: 1 });
    try {
      await migrate(db, { migrationsFolder: previousFolder });
    } finally {
      await pool.end();
    }
  },
});

/** A 0016 só CRIA uma tabela: todo o resto precisa sair idêntico. */
const UNCHANGED = [
  'organizations',
  'outbound_call_jobs',
  'call_attempts',
  'call_sessions',
  'scheduling_session_contexts',
  'audit_logs',
] as const;

const dump = async (table: string) =>
  (await tdb.db.execute(sql.raw(`SELECT * FROM ${table} ORDER BY 1, 2`))).rows;

/**
 * E2 PR 2 — upgrade de um banco descartável POPULADO na 0015 (empresa, job,
 * tentativa, sessão e contexto fixado) para a 0016 (estado do protocolo).
 */
describe('E2 PR2: upgrade from 0015 to 0016 with existing sessions', () => {
  afterAll(async () => {
    await tdb.drop();
    rmSync(previousFolder, { recursive: true, force: true });
  });

  it('keeps every existing row and adds an empty protocol table bound to real sessions', async () => {
    const before = await tdb.db.execute(
      sql`SELECT to_regclass('public.scheduling_protocol_states') AS t`,
    );
    expect(before.rows[0]?.t).toBeNull();
    const tenant = await insertLegacyOutboundTenant(tdb.db, { tag: 'u16' });
    const scope = { organizationId: tenant.organizationId, attemptId: randomUUID() };
    const prepared = await new DrizzleCallAttemptRepository(tdb.db).prepareAttempt({
      ...scope,
      jobId: tenant.jobId,
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    const claim = await new DrizzleCallAttemptRepository(tdb.db).claimSend({
      ...scope,
      ownerId: 'e2-upgrade',
      leaseMs: 60_000,
      eventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    if (claim.kind !== 'CLAIMED') throw new Error(claim.kind);
    const sessionId = randomUUID();
    const created = await new DrizzleCallSessionRepository(tdb.db).create({
      ...scope,
      sessionId,
      now: SCHEDULING_TEST_NOW,
    });
    if (created.kind !== 'CREATED') throw new Error(created.kind);
    await tdb.db.execute(sql`INSERT INTO scheduling_session_contexts
      (organization_id, session_id, agent_version_id, resolution)
      VALUES (${tenant.organizationId}, ${sessionId}, ${tenant.agentVersionId}, 'ABSENT')`);
    const snapshot = Object.fromEntries(
      await Promise.all(UNCHANGED.map(async (table) => [table, await dump(table)])),
    );
    expect((snapshot['call_sessions'] as unknown[]).length).toBe(1);

    await runMigrations({ connectionString: tdb.url });

    for (const table of UNCHANGED) {
      expect([table, await dump(table)]).toEqual([table, snapshot[table]]);
    }
    const empty = await tdb.db.execute(
      sql`SELECT count(*)::int AS n FROM scheduling_protocol_states`,
    );
    expect(empty.rows[0]?.n).toBe(0);
    await tdb.db.insert(schedulingProtocolStates).values({
      organizationId: tenant.organizationId,
      sessionId,
      state: INITIAL_BOOKING_PROTOCOL_STATE,
    });
    // FK composta: estado só existe para uma sessão do MESMO tenant.
    await expect(
      tdb.db.insert(schedulingProtocolStates).values({
        organizationId: tenant.organizationId,
        sessionId: randomUUID(),
        state: INITIAL_BOOKING_PROTOCOL_STATE,
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    const invalid = await tdb.db.execute(
      sql`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND NOT convalidated`,
    );
    expect(invalid.rows[0]?.n).toBe(0);
  });
});
