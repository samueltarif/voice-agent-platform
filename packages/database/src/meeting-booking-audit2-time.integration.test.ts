import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
import { meetingSlotOffers } from './schema/meeting-slot-offers.js';
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
} from './test-support/scheduling-fixtures.js';
import {
  createSchedulingLockProbe,
  type SchedulingLockProbe,
} from './test-support/scheduling-lock-probe.js';

const tdb = await createDisposableTestDatabase('meeting-audit2-time');
const at = (value: string) => new Date(value);
const key = () => `test-${randomUUID()}`;
const AGENT = { type: 'AGENT' as const, id: 'agent-audit2-time' };
const GUARD_KEY = ['e1-audit2', 'after-decision'] as const;

/**
 * 2ª auditoria E1 — bloqueante 2 (A2): a decisão temporal acontece depois de
 * TODAS as esperas, inclusive a trava do telefone, e uma espera posterior à
 * decisão (antes do commit) não efetiva reserva vencida.
 */
describe('E1 audit 2: time decided after every wait', () => {
  const clock = createControlledClock();
  const booking = new DrizzleMeetingBookingService(tdb.db, clock.now);
  const slots = new DrizzleSchedulingSlotRepository(tdb.db);
  const leads = new DrizzleLeadRepository(tdb.db);
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

  /** Oferta do agente, emitida às 08:00 locais (11:00Z) de segunda-feira. */
  async function offerFor(from: Date, ttlMinutes = 15) {
    clock.set(SCHEDULING_TEST_NOW);
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead, contact } = await createSyntheticLead(tdb.db, orgA);
    const attemptId = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantA,
      destinationPhone: contact.phoneE164,
    });
    const offered = await slots.offerSlots({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      sourceAttemptId: attemptId,
      now: SCHEDULING_TEST_NOW,
      from,
      to: new Date(from.getTime() + 86_400_000),
      limit: 1,
      ttlMinutes,
    });
    if (offered.kind !== 'OFFERED') throw new Error(offered.kind);
    return { lead, phone: contact.phoneE164, attemptId, offer: offered.offers[0]! };
  }

  const bookOffer = (offerId: string, sourceAttemptId: string, idempotencyKey = key()) =>
    booking.bookOfferedSlot({
      organizationId: orgA,
      offerId,
      sourceAttemptId,
      idempotencyKey,
      actor: AGENT,
    });

  async function untouched(offerId: string, leadId: string) {
    const [offer] = await tdb.db
      .select()
      .from(meetingSlotOffers)
      .where(eq(meetingSlotOffers.id, offerId));
    const booked = await tdb.db.select().from(meetings).where(eq(meetings.leadId, leadId));
    const view = await leads.getLead(orgA, leadId);
    return [offer!.status, booked.length, view!.status, view!.statusVersion, view!.history.length];
  }

  /** Reserva parada EXATAMENTE na trava do telefone; o relógio avança; a trava é liberada. */
  async function bookWhileHoldingPhone(input: {
    offerId: string;
    attemptId: string;
    phone: string;
    advanceTo: Date;
  }) {
    await probe.holdPhoneLock(orgA, input.phone);
    try {
      const pending = bookOffer(input.offerId, input.attemptId);
      const [waiter] = await probe.waitForPhoneLockWaiters(orgA, input.phone, 1);
      expect(await probe.waitForSessionsBlockedBy(probe.pid, 1)).toContain(waiter);
      clock.set(input.advanceTo);
      await probe.releasePhoneLock(orgA, input.phone);
      return await pending;
    } finally {
      await probe.releasePhoneLock(orgA, input.phone).catch(() => undefined);
    }
  }

  it('expiry: started before expiry, released after it → refused, nothing consumed', async () => {
    const { lead, phone, attemptId, offer } = await offerFor(at('2026-12-01T13:00:00Z'));
    const outcome = await bookWhileHoldingPhone({
      offerId: offer.id,
      attemptId,
      phone,
      advanceTo: new Date(offer.expiresAt.getTime() + 1_000),
    });
    expect(outcome).toEqual({ kind: 'OFFER_EXPIRED' });
    expect(await untouched(offer.id, lead.id)).toEqual(['OFFERED', 0, 'NEW', 1, 1]);
  });

  it('minimum notice: the wait crosses the notice boundary → refused, nothing consumed', async () => {
    // Primeiro horário: 09:00 locais (12:00Z); antecedência de 60 min vence às 11:00Z.
    const { lead, phone, attemptId, offer } = await offerFor(at('2026-11-30T12:00:00Z'), 120);
    expect(offer.startsAt.toISOString()).toBe('2026-11-30T12:00:00.000Z');
    const outcome = await bookWhileHoldingPhone({
      offerId: offer.id,
      attemptId,
      phone,
      advanceTo: at('2026-11-30T11:01:00Z'),
    });
    expect(outcome).toEqual({ kind: 'SLOT_UNAVAILABLE', reason: 'INSIDE_MINIMUM_NOTICE' });
    expect(await untouched(offer.id, lead.id)).toEqual(['OFFERED', 0, 'NEW', 1, 1]);
  });

  it('a valid booking is still replayed after the offer expired, without waiting for the phone lock', async () => {
    const { phone, attemptId, offer } = await offerFor(at('2026-12-01T13:00:00Z'));
    const fixedKey = key();
    const first = await bookOffer(offer.id, attemptId, fixedKey);
    expect(first.kind).toBe('BOOKED');
    clock.set(new Date(offer.expiresAt.getTime() + 60_000));
    await probe.holdPhoneLock(orgA, phone);
    try {
      const replay = await bookOffer(offer.id, attemptId, fixedKey);
      expect(replay.kind === 'REPLAYED' && replay.meeting.id).toBe(
        first.kind === 'BOOKED' && first.meeting.id,
      );
    } finally {
      await probe.releasePhoneLock(orgA, phone);
    }
  });

  it('a wait AFTER the decision (before commit) cannot confirm an offer that expired meanwhile', async () => {
    const { lead, attemptId, offer } = await offerFor(at('2026-12-01T13:00:00Z'));
    await tdb.db.execute(
      sql.raw(`
      CREATE FUNCTION e1_wait_after_decision() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'meeting.booked' THEN
          PERFORM pg_advisory_xact_lock(hashtextextended('${GUARD_KEY[0]}' || ':' || '${GUARD_KEY[1]}', 0));
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER e1_wait_after_decision BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION e1_wait_after_decision();`),
    );
    await probe.holdPhoneLock(...GUARD_KEY);
    try {
      const pending = bookOffer(offer.id, attemptId);
      await probe.waitForPhoneLockWaiters(...GUARD_KEY, 1);
      clock.set(new Date(offer.expiresAt.getTime() + 1_000));
      await probe.releasePhoneLock(...GUARD_KEY);
      expect(await pending).toEqual({ kind: 'OFFER_EXPIRED' });
      expect(await untouched(offer.id, lead.id)).toEqual(['OFFERED', 0, 'NEW', 1, 1]);
    } finally {
      await probe.releasePhoneLock(...GUARD_KEY).catch(() => undefined);
      await tdb.db.execute(
        sql.raw(
          'DROP TRIGGER e1_wait_after_decision ON audit_logs; DROP FUNCTION e1_wait_after_decision();',
        ),
      );
    }
  });
});
