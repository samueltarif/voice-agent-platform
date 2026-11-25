import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { runMigrations } from './client/migrate.js';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { contacts } from './schema/contacts.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import { createDurableOutboundFixture } from './test-support/durable-outbound-fixtures.js';
import {
  createSyntheticContact,
  createWeekdayCalendar,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
const PREVIOUS_TAG = '0013_operations_overview_index';

/** Cópia temporária das migrations com o journal cortado na 0013 (estado anterior à E1). */
function migrationsUpTo0013(): string {
  const folder = mkdtempSync(join(tmpdir(), 'e1-upgrade-'));
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

const previousFolder = migrationsUpTo0013();
const tdb = await createDisposableTestDatabase('scheduling-upgrade-0014', {
  runMigrationsFn: async ({ connectionString }) => {
    const { db, pool } = createDatabaseConnection({ connectionString, maxConnections: 1 });
    try {
      await migrate(db, { migrationsFolder: previousFolder });
    } finally {
      await pool.end();
    }
  },
});

/** Auditoria E1 — upgrade de um banco descartável POPULADO da 0013 para a 0014. */
describe('E1 audit: upgrade from migration 0013 to 0014 with existing data', () => {
  afterAll(async () => {
    await tdb.drop();
    rmSync(previousFolder, { recursive: true, force: true });
  });

  it('keeps existing tenants, contacts and jobs and enables leads and meetings', async () => {
    const before = await tdb.db.execute(sql`SELECT to_regclass('public.meetings') AS t`);
    expect(before.rows[0]?.t).toBeNull();
    const fx = await createDurableOutboundFixture(tdb.db);
    const contact = await createSyntheticContact(tdb.db, fx.tenantA.organizationId);
    const counts = async () =>
      (
        await tdb.db.execute(
          sql`SELECT (SELECT count(*) FROM contacts)::int AS c, (SELECT count(*) FROM outbound_call_jobs)::int AS j`,
        )
      ).rows[0];
    const populated = await counts();

    await runMigrations({ connectionString: tdb.url });

    expect(await counts()).toEqual(populated);
    const [kept] = await tdb.db.select().from(contacts).where(eq(contacts.id, contact.id));
    expect(kept!.phoneE164).toBe(contact.phoneE164);
    const created = await new DrizzleLeadRepository(tdb.db).createLeadForContact({
      organizationId: fx.tenantA.organizationId,
      contactId: contact.id,
      actor: SCHEDULING_TEST_USER,
    });
    if (created.kind !== 'CREATED') throw new Error(created.kind);
    const calendar = await createWeekdayCalendar(tdb.db, {
      organizationId: fx.tenantA.organizationId,
    });
    const booked = await new DrizzleMeetingBookingService(
      tdb.db,
      () => SCHEDULING_TEST_NOW,
    ).bookMeeting({
      organizationId: fx.tenantA.organizationId,
      calendarId: calendar.id,
      leadId: created.lead.id,
      startsAt: new Date('2026-12-01T13:00:00.000Z'),
      idempotencyKey: `upgrade-${randomUUID()}`,
      actor: SCHEDULING_TEST_USER,
    });
    expect(booked.kind).toBe('BOOKED');
    const applied = await tdb.db.execute(
      sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
    );
    expect(applied.rows[0]?.n).toBe(15);
  });
});
