import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { runMigrations } from './client/migrate.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { meetingSlotOffers } from './schema/meeting-slot-offers.js';
import { meetings } from './schema/meetings.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import { insertLegacyOutboundTenant } from './test-support/legacy-schema-fixtures.js';
import {
  createSyntheticContact,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
const PREVIOUS_TAG = '0014_leads_scheduling_meetings';

function migrationsUpTo0014(): string {
  const folder = mkdtempSync(join(tmpdir(), 'e2-upgrade-'));
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

const previousFolder = migrationsUpTo0014();
const tdb = await createDisposableTestDatabase('scheduling-upgrade-0015', {
  runMigrationsFn: async ({ connectionString }) => {
    const { db, pool } = createDatabaseConnection({ connectionString, maxConnections: 1 });
    try {
      await migrate(db, { migrationsFolder: previousFolder });
    } finally {
      await pool.end();
    }
  },
});

/** Tabelas que a 0015 NÃO altera: conteúdo comparado linha a linha antes/depois. */
const UNCHANGED = [
  'organizations',
  'contacts',
  'outbound_call_jobs',
  'call_attempts',
  'leads',
  'lead_status_changes',
  'meeting_slot_offers',
  'meetings',
  'audit_logs',
] as const;

const dump = async (table: string) =>
  (await tdb.db.execute(sql.raw(`SELECT * FROM ${table} ORDER BY 1, 2`))).rows;

/**
 * E2 PR 1 (auditoria) — upgrade de um banco descartável POPULADO na 0014
 * (empresas, contatos, campanhas, jobs, tentativa, leads, histórico, agenda,
 * oferta e reunião) para a 0015. Pré-upgrade em SQL explícito onde o ORM atual
 * listaria colunas novas.
 */
describe('E2 PR1 audit: upgrade from 0014 to 0015 with E1 data', () => {
  afterAll(async () => {
    await tdb.drop();
    rmSync(previousFolder, { recursive: true, force: true });
  });

  it('preserves every row, link and FK and adds only inert defaults', async () => {
    const before = await tdb.db.execute(
      sql`SELECT to_regclass('public.scheduling_session_contexts') AS t`,
    );
    expect(before.rows[0]?.t).toBeNull();
    const tenant = await insertLegacyOutboundTenant(tdb.db, { tag: 'u15' });
    await insertLegacyOutboundTenant(tdb.db, { tag: 'u15b' });
    const contact = await createSyntheticContact(tdb.db, tenant.organizationId);
    const created = await new DrizzleLeadRepository(tdb.db).createLeadForContact({
      organizationId: tenant.organizationId,
      contactId: contact.id,
      actor: SCHEDULING_TEST_USER,
    });
    if (created.kind !== 'CREATED') throw new Error(created.kind);
    const prepared = await new DrizzleCallAttemptRepository(tdb.db).prepareAttempt({
      organizationId: tenant.organizationId,
      jobId: tenant.jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    const calendar = (
      await tdb.db.execute(sql`INSERT INTO scheduling_calendars
        (organization_id, name, timezone, slot_duration_minutes, booking_horizon_days)
        VALUES (${tenant.organizationId}, 'Agenda legada', 'America/Sao_Paulo', 30, 30) RETURNING id`)
    ).rows[0] as { id: string };
    const [offer] = await tdb.db
      .insert(meetingSlotOffers)
      .values({
        organizationId: tenant.organizationId,
        calendarId: calendar.id,
        leadId: created.lead.id,
        startsAt: new Date('2026-12-01T13:00:00Z'),
        endsAt: new Date('2026-12-01T13:30:00Z'),
        expiresAt: new Date('2026-11-30T11:15:00Z'),
        status: 'ACCEPTED',
      })
      .returning();
    await tdb.db.insert(meetings).values({
      organizationId: tenant.organizationId,
      calendarId: calendar.id,
      leadId: created.lead.id,
      startsAt: offer!.startsAt,
      endsAt: offer!.endsAt,
      idempotencyKey: `legacy-${randomUUID()}`,
      requestFingerprint: 'a'.repeat(64),
      slotOfferId: offer!.id,
      bookedByType: 'USER',
      bookedById: SCHEDULING_TEST_USER.id,
    });
    const legacyCampaigns = sql`SELECT id, organization_id, agent_id, agent_version_id, name, status FROM outbound_campaigns ORDER BY id`;
    const legacyCalendars = sql`SELECT id, organization_id, name, timezone, slot_duration_minutes, version FROM scheduling_calendars ORDER BY id`;
    const snapshot = {
      unchanged: Object.fromEntries(
        await Promise.all(UNCHANGED.map(async (t) => [t, await dump(t)])),
      ),
      campaigns: (await tdb.db.execute(legacyCampaigns)).rows,
      calendars: (await tdb.db.execute(legacyCalendars)).rows,
    };
    expect((snapshot.unchanged['meetings'] as unknown[]).length).toBe(1);

    await runMigrations({ connectionString: tdb.url });

    for (const table of UNCHANGED)
      expect([table, await dump(table)]).toEqual([table, snapshot.unchanged[table]]);
    expect((await tdb.db.execute(legacyCampaigns)).rows).toEqual(snapshot.campaigns);
    expect((await tdb.db.execute(legacyCalendars)).rows).toEqual(snapshot.calendars);
    const defaults = await tdb.db.execute(sql`SELECT
      (SELECT count(*) FROM outbound_campaigns WHERE scheduling_calendar_id IS NOT NULL)::int AS configured,
      (SELECT count(*) FROM scheduling_calendars WHERE is_organization_default)::int AS defaults,
      (SELECT count(*) FROM scheduling_session_contexts)::int AS pinned`);
    expect(defaults.rows[0]).toEqual({ configured: 0, defaults: 0, pinned: 0 });
    // Vínculos: reunião → oferta → lead → contato, todos válidos; nenhuma FK deixou de valer.
    const links = await tdb.db.execute(sql`SELECT count(*)::int AS n FROM meetings m
      JOIN meeting_slot_offers o ON o.id = m.slot_offer_id AND o.organization_id = m.organization_id
      JOIN leads l ON l.id = m.lead_id AND l.organization_id = m.organization_id
      JOIN contacts c ON c.id = l.contact_id AND c.organization_id = l.organization_id`);
    expect(links.rows[0]?.n).toBe(1);
    const invalid = await tdb.db.execute(
      sql`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND NOT convalidated`,
    );
    expect(invalid.rows[0]?.n).toBe(0);
  });
});
