import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
import { contactSuppressions } from './schema/contacts.js';
import { meetings } from './schema/meetings.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createControlledClock,
  createSyntheticLead,
  createWeekdayCalendar,
  prepareSyntheticAttempt,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';
import {
  createSchedulingLockProbe,
  type SchedulingLockProbe,
} from './test-support/scheduling-lock-probe.js';

const tdb = await createDisposableTestDatabase('meeting-audit2-locks');
const key = () => `test-${randomUUID()}`;
const TUESDAY_10 = new Date('2026-12-01T13:00:00.000Z');
const AGENT = { type: 'AGENT' as const, id: 'agent-audit2-locks' };
const USER = SCHEDULING_TEST_USER;

/**
 * 2ª auditoria E1 — bloqueante 3 (A4): ordem global de travas. Cada cenário
 * prende a trava do telefone numa conexão independente, enfileira a 1ª
 * operação NELA, inicia a 2ª e só solta quando a 2ª está comprovadamente
 * bloqueada pela 1ª. Sem ordem compatível, o PostgreSQL aborta uma delas
 * (deadlock_detected); com ela, as duas terminam e o opt-out vale.
 */
describe('E1 audit 2: global lock order (offers, bookings, opt-out, suppressions, send claim)', () => {
  const clock = createControlledClock();
  const booking = new DrizzleMeetingBookingService(tdb.db, clock.now);
  const slots = new DrizzleSchedulingSlotRepository(tdb.db);
  const leads = new DrizzleLeadRepository(tdb.db);
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;
  let probe: SchedulingLockProbe;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
    probe = await createSchedulingLockProbe(tdb.url);
  });

  afterAll(async () => {
    await probe.close();
    await tdb.drop();
  });

  async function setup() {
    clock.set(SCHEDULING_TEST_NOW);
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead, contact } = await createSyntheticLead(tdb.db, orgA);
    const attemptId = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantA,
      destinationPhone: contact.phoneE164,
    });
    return { calendar, lead, phone: contact.phoneE164, attemptId };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;
  const offer = (s: Setup) =>
    slots.offerSlots({
      organizationId: orgA,
      calendarId: s.calendar.id,
      leadId: s.lead.id,
      sourceAttemptId: s.attemptId,
      now: SCHEDULING_TEST_NOW,
      from: TUESDAY_10,
      to: new Date('2026-12-02T03:00:00Z'),
      limit: 1,
    });
  const optOut = (s: Setup) =>
    leads.recordOptOut({ organizationId: orgA, leadId: s.lead.id, actor: USER });
  const confirm = (s: Setup, offerId: string) =>
    booking.bookOfferedSlot({
      organizationId: orgA,
      offerId,
      sourceAttemptId: s.attemptId,
      idempotencyKey: key(),
      actor: AGENT,
    });

  /** 1ª operação na fila da trava do telefone; 2ª bloqueada pela 1ª; libera; ambas terminam. */
  async function ordered<A, B>(s: Setup, first: () => Promise<A>, second: () => Promise<B>) {
    await probe.holdPhoneLock(orgA, s.phone);
    try {
      const a = first();
      const [firstPid] = await probe.waitForPhoneLockWaiters(orgA, s.phone, 1);
      const b = second();
      await probe.waitForSessionsBlockedBy(firstPid!, 1);
      await probe.releasePhoneLock(orgA, s.phone);
      return (await Promise.allSettled([a, b])) as [
        PromiseSettledResult<A>,
        PromiseSettledResult<B>,
      ];
    } finally {
      await probe.releasePhoneLock(orgA, s.phone).catch(() => undefined);
    }
  }

  const value = <T>(settled: PromiseSettledResult<T>): T => {
    if (settled.status === 'rejected') throw settled.reason;
    return settled.value;
  };
  const suppressed = async (phone: string) =>
    (
      await tdb.db
        .select()
        .from(contactSuppressions)
        .where(
          and(
            eq(contactSuppressions.organizationId, orgA),
            eq(contactSuppressions.phoneE164, phone),
          ),
        )
    ).length;

  it('offer BEFORE opt-out: both finish; the issued offer can no longer be confirmed', async () => {
    const s = await setup();
    const [offered, opted] = await ordered(
      s,
      () => offer(s),
      () => optOut(s),
    );
    const issued = value(offered);
    expect(value(opted).kind).toBe('CHANGED');
    expect(await suppressed(s.phone)).toBe(1);
    if (issued.kind !== 'OFFERED') throw new Error(issued.kind);
    expect(await confirm(s, issued.offers[0]!.id)).toEqual({ kind: 'LEAD_SUPPRESSED' });
  });

  it('opt-out BEFORE offer: the offer is refused', async () => {
    const s = await setup();
    const [opted, offered] = await ordered(
      s,
      () => optOut(s),
      () => offer(s),
    );
    expect(value(opted).kind).toBe('CHANGED');
    expect(value(offered)).toEqual({ kind: 'LEAD_SUPPRESSED' });
    expect(await suppressed(s.phone)).toBe(1);
  });

  it('booking BEFORE opt-out: the meeting is kept, the phone is suppressed', async () => {
    const s = await setup();
    const issued = await offer(s);
    if (issued.kind !== 'OFFERED') throw new Error(issued.kind);
    const [booked, opted] = await ordered(
      s,
      () => confirm(s, issued.offers[0]!.id),
      () => optOut(s),
    );
    expect(value(booked).kind).toBe('BOOKED');
    expect(value(opted).kind).toBe('OPTED_OUT_MEETING_PRESERVED');
    expect(await suppressed(s.phone)).toBe(1);
    const kept = await tdb.db.select().from(meetings).where(eq(meetings.leadId, s.lead.id));
    expect(kept.map((m) => m.status)).toEqual(['SCHEDULED']);
  });

  it('opt-out BEFORE booking: the agent confirmation is refused', async () => {
    const s = await setup();
    const issued = await offer(s);
    if (issued.kind !== 'OFFERED') throw new Error(issued.kind);
    const [opted, booked] = await ordered(
      s,
      () => optOut(s),
      () => confirm(s, issued.offers[0]!.id),
    );
    expect(value(opted).kind).toBe('CHANGED');
    expect(value(booked)).toEqual({ kind: 'LEAD_SUPPRESSED' });
    expect(await tdb.db.select().from(meetings).where(eq(meetings.leadId, s.lead.id))).toEqual([]);
  });

  it('suppression through the contacts path BEFORE the confirmation of an issued offer', async () => {
    const s = await setup();
    const issued = await offer(s);
    if (issued.kind !== 'OFFERED') throw new Error(issued.kind);
    const [added, booked] = await ordered(
      s,
      () =>
        suppressions.addSuppression({
          organizationId: orgA,
          phoneE164: s.phone,
          reason: 'OPT_OUT',
        }),
      () => confirm(s, issued.offers[0]!.id),
    );
    expect(value(added).kind).toBe('SUPPRESSED');
    expect(value(booked)).toEqual({ kind: 'LEAD_SUPPRESSED' });
  });

  it('offer BEFORE a send claim of the same attempt: no lock cycle through the attempt row', async () => {
    const s = await setup();
    const [offered, claimed] = await ordered(
      s,
      () => offer(s),
      () =>
        attempts.claimSend({
          organizationId: orgA,
          attemptId: s.attemptId,
          ownerId: 'worker-audit2',
          leaseMs: 60_000,
          eventId: randomUUID(),
          now: SCHEDULING_TEST_NOW,
        }),
    );
    expect(value(offered).kind).toBe('OFFERED');
    expect(value(claimed).kind).toBe('CLAIMED');
  });
});
