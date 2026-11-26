import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { DrizzleCallAttemptRepository } from '../repositories/call-attempt-repository.js';
import { DrizzleLeadRepository } from '../repositories/lead-repository.js';
import { DrizzleSchedulingAvailabilityRepository } from '../repositories/scheduling-availability-repository.js';
import { DrizzleSchedulingCalendarRepository } from '../repositories/scheduling-calendar-repository.js';
import type { SchedulingActor } from '../repositories/scheduling-audit-entry.js';
import { contacts, contactSuppressions } from '../schema/contacts.js';
import { createExtraJob, type TenantFixture } from './durable-outbound-fixtures.js';

/**
 * E1 (DEC-074) — fixtures sintéticas de leads e agendas, criadas dentro de um
 * banco descartável por suíte (o descarte é o DROP do banco inteiro).
 */
export const SCHEDULING_TEST_USER: SchedulingActor = { type: 'USER', id: 'usr-scheduling-test' };

/** Segunda-feira 30/11/2026, 08:00 em São Paulo. */
export const SCHEDULING_TEST_NOW = new Date('2026-11-30T11:00:00.000Z');

export const SAO_PAULO_POLICY = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  minimumNoticeMinutes: 60,
  bookingHorizonDays: 30,
};

/** Segunda a sexta, 09:00–12:00 local. */
export const WEEKDAY_MORNINGS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 540,
  endMinute: 720,
}));

let phoneSequence = 0;

/** Telefone E.164 sintético e único por chamada (faixa +55 11 9xxxx-xxxx). */
export function nextSyntheticPhone(): string {
  phoneSequence += 1;
  return `+55119${String(10_000_000 + phoneSequence * 7_919).slice(-8)}`;
}

export async function createSyntheticContact(
  db: DatabaseInstance,
  organizationId: string,
  phoneE164: string = nextSyntheticPhone(),
) {
  const [contact] = await db
    .insert(contacts)
    .values({ organizationId, phoneE164, displayName: `Lead ${randomUUID().slice(0, 6)}` })
    .returning();
  return contact!;
}

export async function createSyntheticLead(db: DatabaseInstance, organizationId: string) {
  const contact = await createSyntheticContact(db, organizationId);
  const outcome = await new DrizzleLeadRepository(db).createLeadForContact({
    organizationId,
    contactId: contact.id,
    actor: SCHEDULING_TEST_USER,
  });
  if (outcome.kind !== 'CREATED') throw new Error(`Lead fixture failed: ${outcome.kind}`);
  return { contact, lead: outcome.lead };
}

export async function createWeekdayCalendar(
  db: DatabaseInstance,
  input: {
    readonly organizationId: string;
    readonly policy?: Partial<typeof SAO_PAULO_POLICY> | undefined;
    readonly rules?: typeof WEEKDAY_MORNINGS | undefined;
  },
) {
  const created = await new DrizzleSchedulingCalendarRepository(db).createCalendar({
    organizationId: input.organizationId,
    name: `Agenda ${randomUUID().slice(0, 8)}`,
    policy: { ...SAO_PAULO_POLICY, ...input.policy },
    actor: SCHEDULING_TEST_USER,
  });
  if (created.kind !== 'CREATED') throw new Error('Calendar fixture failed.');
  const replaced = await new DrizzleSchedulingAvailabilityRepository(db).replaceWeeklyAvailability({
    organizationId: input.organizationId,
    calendarId: created.calendar.id,
    expectedVersion: 1,
    rules: input.rules ?? WEEKDAY_MORNINGS,
    actor: SCHEDULING_TEST_USER,
  });
  if (replaced.kind !== 'UPDATED') throw new Error('Availability fixture failed.');
  return replaced.calendar;
}

/**
 * Tentativa de ligação durável para o telefone informado (job próprio). Usada
 * para provar o vínculo tentativa ↔ lead resolvido no servidor (A3).
 */
export async function prepareSyntheticAttempt(
  db: DatabaseInstance,
  input: { readonly tenant: TenantFixture; readonly destinationPhone: string },
): Promise<string> {
  const jobId = await createExtraJob(db, {
    tenant: input.tenant,
    tag: 'scheduling',
    destinationPhone: input.destinationPhone,
  });
  const prepared = await new DrizzleCallAttemptRepository(db).prepareAttempt({
    organizationId: input.tenant.organizationId,
    jobId,
    attemptId: randomUUID(),
    correlationId: randomUUID(),
    intentEventId: randomUUID(),
    now: SCHEDULING_TEST_NOW,
  });
  if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
  return prepared.record.attempt.id;
}

/** Relógio controlável para provar decisões tomadas DEPOIS das travas (A2). */
export function createControlledClock(start: Date = SCHEDULING_TEST_NOW) {
  let current = start;
  return {
    now: () => current,
    set: (next: Date) => {
      current = next;
    },
  };
}

/** Linhas da supressão CANÔNICA (a consultada no disparo) para o telefone no tenant. */
export async function countPhoneSuppressions(
  db: DatabaseInstance,
  input: { readonly organizationId: string; readonly phoneE164: string },
): Promise<number> {
  const rows = await db
    .select({ id: contactSuppressions.id })
    .from(contactSuppressions)
    .where(
      and(
        eq(contactSuppressions.organizationId, input.organizationId),
        eq(contactSuppressions.phoneE164, input.phoneE164),
      ),
    );
  return rows.length;
}
