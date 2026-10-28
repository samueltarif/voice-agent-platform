import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './client/migrate.js';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('durable-outbound-schema');

const MIGRATION = readFileSync(
  join(import.meta.dirname, 'migrations', '0007_durable_outbound_persistence.sql'),
  'utf8',
);

async function failureOf(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    return classifyPostgresFailure(error);
  }
  return null;
}

describe('008-OF2 migration on a brand-new disposable database', () => {
  it('applies all migrations (0000–0009) from empty and is idempotent on re-run', async () => {
    // `tdb` foi criado vazio e migrado do zero; a nova execução prova idempotência.
    await runMigrations({ connectionString: tdb.url });
    const fresh = tdb;
    {
      const tables = await fresh.db.execute<{ name: string }>(sql`
        SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'
          AND tablename IN ('organization_phone_numbers','call_attempts','call_sessions','call_events')
        ORDER BY 1`);
      expect(tables.rows.map((r) => r.name)).toEqual([
        'call_attempts',
        'call_events',
        'call_sessions',
        'organization_phone_numbers',
      ]);
      const triggers = await fresh.db.execute<{ total: string }>(sql`
        SELECT count(*)::text AS total FROM pg_trigger WHERE NOT tgisinternal
          AND tgname IN ('call_events_append_only','call_events_no_truncate','call_attempts_identity_guard',
                         'call_sessions_identity_guard','organization_phone_numbers_identity_guard')`);
      expect(triggers.rows[0]?.total).toBe('5');
      const applied = await fresh.db.execute<{ total: string }>(
        sql`SELECT count(*)::text AS total FROM drizzle.__drizzle_migrations`,
      );
      expect(applied.rows[0]?.total).toBe('10');
      const lookup = await fresh.db.execute<{ name: string }>(sql`
        SELECT indexname AS name FROM pg_indexes
          WHERE tablename = 'call_attempts' AND indexname = 'call_attempts_provider_reference_idx'`);
      expect(lookup.rows).toHaveLength(1);
    }
  });

  it('is additive: no DROP, RENAME, TRUNCATE or column type change on legacy tables', () => {
    expect(MIGRATION).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT|INDEX)\b/i);
    expect(MIGRATION).not.toMatch(/\bRENAME\b|^\s*TRUNCATE\b|ALTER\s+COLUMN/im);
    const legacyAlters =
      MIGRATION.match(
        /ALTER TABLE "(agent_versions|outbound_call_jobs|outbound_campaigns)"[^;]*/g,
      ) ?? [];
    expect(legacyAlters).toHaveLength(3);
    expect(legacyAlters.every((stmt) => /ADD CONSTRAINT "[a-z_]+_unique" UNIQUE/.test(stmt))).toBe(
      true,
    );
  });
});

describe('008-OF2 database-level guarantees (raw SQL, bypassing repositories)', () => {
  const db = tdb.db;
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  function rawAttempt(
    t: TenantFixture,
    o: { jobId?: string; number?: number; state?: string; key?: string; id?: string } = {},
  ) {
    return db.execute(sql`
      INSERT INTO call_attempts (id, organization_id, job_id, attempt_number, correlation_id, idempotency_key,
        agent_id, agent_version_id, state, created_at)
      VALUES (${o.id ?? randomUUID()}, ${t.organizationId}, ${o.jobId ?? t.jobId}, ${o.number ?? 1}, ${randomUUID()},
        ${o.key ?? randomUUID()}, ${t.agentId}, ${t.agentVersionId}, ${o.state ?? 'CANCELED'}::call_attempt_state, now())`);
  }

  it('rejects an attempt pointing at another tenant job or agent version (composite FKs)', async () => {
    expect((await failureOf(rawAttempt(fx.tenantA, { jobId: fx.tenantB.jobId })))?.kind).toBe(
      'FOREIGN_KEY_VIOLATION',
    );
    const crossedVersion = db.execute(sql`
      INSERT INTO call_attempts (id, organization_id, job_id, attempt_number, correlation_id, idempotency_key,
        agent_id, agent_version_id, state, created_at)
      VALUES (${randomUUID()}, ${fx.tenantA.organizationId}, ${fx.tenantA.jobId}, 9, ${randomUUID()}, ${randomUUID()},
        ${fx.tenantB.agentId}, ${fx.tenantB.agentVersionId}, 'CANCELED', now())`);
    expect((await failureOf(crossedVersion))?.kind).toBe('FOREIGN_KEY_VIOLATION');
  });

  it('enforces attempt identity uniqueness and a single open attempt per job', async () => {
    const key = randomUUID();
    await rawAttempt(fx.tenantA, { number: 1, key });
    expect(await failureOf(rawAttempt(fx.tenantA, { number: 1 }))).toMatchObject({
      kind: 'UNIQUE_VIOLATION',
      constraint: 'call_attempts_job_number_uidx',
    });
    expect((await failureOf(rawAttempt(fx.tenantA, { number: 2, key })))?.constraint).toBe(
      'call_attempts_org_idempotency_uidx',
    );
    await rawAttempt(fx.tenantA, { number: 2, state: 'OUTCOME_UNKNOWN' });
    expect(
      (await failureOf(rawAttempt(fx.tenantA, { number: 3, state: 'ORIGINATION_PENDING' })))
        ?.constraint,
    ).toBe('call_attempts_single_open_per_job_uidx');
  });

  it('blocks identity rewrites, terminal regressions and event-log updates via triggers', async () => {
    const id = randomUUID();
    await rawAttempt(fx.tenantB, { id, number: 1, state: 'NOT_ORIGINATED' });
    const moveTenant = db.execute(
      sql`UPDATE call_attempts SET organization_id = ${fx.tenantA.organizationId}, state_version = state_version + 1 WHERE id = ${id}`,
    );
    expect((await failureOf(moveTenant))?.kind).toMatch(/INVARIANT_GUARD|FOREIGN_KEY_VIOLATION/);
    const reopen = db.execute(
      sql`UPDATE call_attempts SET state = 'ORIGINATION_PENDING', state_version = state_version + 1 WHERE id = ${id}`,
    );
    expect((await failureOf(reopen))?.kind).toBe('INVARIANT_GUARD');
    await db.execute(sql`
      INSERT INTO call_events (event_id, organization_id, attempt_id, event_type, fingerprint, application_result)
      VALUES (${randomUUID()}, ${fx.tenantB.organizationId}, ${id}, 'INTENT_RECORDED', ${'a'.repeat(64)}, 'APPLIED')`);
    const tamper = db.execute(
      sql`UPDATE call_events SET event_type = 'CLOSED' WHERE attempt_id = ${id}`,
    );
    expect((await failureOf(tamper))?.kind).toBe('INVARIANT_GUARD');
    const crossEvent = db.execute(sql`
      INSERT INTO call_events (event_id, organization_id, attempt_id, event_type, fingerprint, application_result)
      VALUES (${randomUUID()}, ${fx.tenantA.organizationId}, ${id}, 'INTENT_RECORDED', ${'b'.repeat(64)}, 'APPLIED')`);
    expect((await failureOf(crossEvent))?.kind).toBe('FOREIGN_KEY_VIOLATION');
    const orphan = db.execute(sql`
      INSERT INTO call_events (event_id, organization_id, event_type, fingerprint, application_result)
      VALUES (${randomUUID()}, ${fx.tenantA.organizationId}, 'X', ${'c'.repeat(64)}, 'APPLIED')`);
    expect((await failureOf(orphan))?.kind).toBe('CHECK_VIOLATION');
  });

  it('rejects sessions bound to another tenant attempt and invalid phone numbers', async () => {
    const attemptId = randomUUID();
    await rawAttempt(fx.tenantA, { id: attemptId, number: 50, state: 'CLOSED' });
    const crossedSession = db.execute(sql`
      INSERT INTO call_sessions (id, organization_id, agent_id, agent_version_id, current_attempt_id, started_at)
      VALUES (${randomUUID()}, ${fx.tenantB.organizationId}, ${fx.tenantB.agentId}, ${fx.tenantB.agentVersionId},
        ${attemptId}, now())`);
    expect((await failureOf(crossedSession))?.kind).toBe('FOREIGN_KEY_VIOLATION');
    const badNumber = db.execute(sql`
      INSERT INTO organization_phone_numbers (organization_id, e164_number)
      VALUES (${fx.tenantA.organizationId}, '5511999990000')`);
    expect((await failureOf(badNumber))?.kind).toBe('CHECK_VIOLATION');
  });
});
