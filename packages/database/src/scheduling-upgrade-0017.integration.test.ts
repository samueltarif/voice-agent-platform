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
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import { insertLegacyOutboundTenant } from './test-support/legacy-schema-fixtures.js';
import {
  createSyntheticContact,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
const PREVIOUS_TAG = '0016_scheduling_protocol_state';

function migrationsUpTo0016(): string {
  const folder = mkdtempSync(join(tmpdir(), 'e2-upgrade-17-'));
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

const previousFolder = migrationsUpTo0016();
const tdb = await createDisposableTestDatabase('scheduling-upgrade-0017', {
  runMigrationsFn: async ({ connectionString }) => {
    const { db, pool } = createDatabaseConnection({ connectionString, maxConnections: 1 });
    try {
      await migrate(db, { migrationsFolder: previousFolder });
    } finally {
      await pool.end();
    }
  },
});

/** A 0017 só ACRESCENTA um valor de enum e colunas nulas: todo o resto precisa sair idêntico. */
const UNCHANGED = [
  'organizations',
  'outbound_call_jobs',
  'call_attempts',
  'call_sessions',
  'scheduling_session_contexts',
  'lead_status_changes',
  'audit_logs',
] as const;
const PROTOCOL_COLUMNS = sql`SELECT organization_id, session_id, state, seq, lead_speech_started_seq,
  opt_out_pending, version FROM scheduling_protocol_states ORDER BY 1, 2`;

const dump = async (table: string) =>
  (await tdb.db.execute(sql.raw(`SELECT * FROM ${table} ORDER BY 1, 2`))).rows;

/**
 * E2 PR 3 — upgrade de um banco descartável POPULADO na 0016 (empresa, lead
 * com histórico, tentativa, sessão, contexto fixado e estado do protocolo)
 * para a 0017 (origem `CALL_OUTCOME` e colunas de opt-out/esclarecimento).
 */
describe('E2 PR3: upgrade from 0016 to 0017 with existing protocol state', () => {
  afterAll(async () => {
    await tdb.drop();
    rmSync(previousFolder, { recursive: true, force: true });
  });

  async function populate() {
    const tenant = await insertLegacyOutboundTenant(tdb.db, { tag: 'u17' });
    const contact = await createSyntheticContact(tdb.db, tenant.organizationId);
    const lead = await new DrizzleLeadRepository(tdb.db).createLeadForContact({
      organizationId: tenant.organizationId,
      contactId: contact.id,
      actor: SCHEDULING_TEST_USER,
    });
    if (lead.kind !== 'CREATED') throw new Error(lead.kind);
    const scope = { organizationId: tenant.organizationId, attemptId: randomUUID() };
    const attempts = new DrizzleCallAttemptRepository(tdb.db);
    const prepared = await attempts.prepareAttempt({
      ...scope,
      jobId: tenant.jobId,
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    const claim = await attempts.claimSend({
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
    // SQL explícito: o ORM atual listaria as colunas novas da 0017.
    await tdb.db.execute(sql`INSERT INTO scheduling_protocol_states
      (organization_id, session_id, state, seq, opt_out_pending)
      VALUES (${tenant.organizationId}, ${sessionId}, ${JSON.stringify(INITIAL_BOOKING_PROTOCOL_STATE)}::jsonb, 3, true)`);
    return { tenant, sessionId };
  }

  it('keeps every existing row; new columns start empty and the new origin is usable', async () => {
    const { tenant, sessionId } = await populate();
    const snapshot = Object.fromEntries(
      await Promise.all(UNCHANGED.map(async (table) => [table, await dump(table)])),
    );
    const protocolBefore = (await tdb.db.execute(PROTOCOL_COLUMNS)).rows;
    expect(protocolBefore).toHaveLength(1);

    await runMigrations({ connectionString: tdb.url });

    for (const table of UNCHANGED) {
      expect([table, await dump(table)]).toEqual([table, snapshot[table]]);
    }
    expect((await tdb.db.execute(PROTOCOL_COLUMNS)).rows).toEqual(protocolBefore);
    const fresh = await tdb.db.execute(sql`SELECT opt_out_question_generation AS g,
      opt_out_question_delivered_seq AS d, opt_out_recorded_at AS r, opt_out_source AS s
      FROM scheduling_protocol_states`);
    expect(fresh.rows).toEqual([{ g: null, d: null, r: null, s: null }]);
    const origin = await tdb.db.execute(sql`SELECT 'CALL_OUTCOME'::lead_status_change_origin AS o`);
    expect(origin.rows[0]?.o).toBe('CALL_OUTCOME');
    // Coerência: opt-out gravado exige origem conhecida, e origem exige data.
    await expect(
      tdb.db.execute(sql`UPDATE scheduling_protocol_states SET opt_out_source = 'MODEL'
        WHERE organization_id = ${tenant.organizationId} AND session_id = ${sessionId}`),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await tdb.db.execute(sql`UPDATE scheduling_protocol_states
      SET opt_out_recorded_at = now(), opt_out_source = 'AGENT_TOOL'
      WHERE organization_id = ${tenant.organizationId} AND session_id = ${sessionId}`);
    const invalid = await tdb.db.execute(
      sql`SELECT count(*)::int AS n FROM pg_constraint WHERE contype IN ('f', 'c') AND NOT convalidated`,
    );
    expect(invalid.rows[0]?.n).toBe(0);
  });
});
