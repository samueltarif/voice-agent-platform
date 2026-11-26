import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
import { auditLogs } from './schema/audit.js';
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
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('meeting-audit2-agent');
const key = () => `test-${randomUUID()}`;
const TUESDAY_10 = new Date('2026-12-01T13:00:00.000Z');
const AGENT = { type: 'AGENT' as const, id: 'agent-audit2' };
const USER = SCHEDULING_TEST_USER;

/** Erro do PostgreSQL na cadeia `cause` (o driver pode embrulhar o erro original). */
function postgresError(error: unknown): { code?: string; message?: string | undefined } {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as { code?: unknown; message?: string; cause?: unknown };
    if (typeof candidate.code === 'string')
      return { code: candidate.code, message: candidate.message };
    current = candidate.cause;
  }
  return {};
}

/**
 * 2ª auditoria E1 — bloqueante 4 (A3) por TODOS os caminhos de entrada do
 * serviço, mais lacunas de teste: rollback da reserva por oferta, confirmação
 * após supressão e a mesma chave de idempotência em organizações distintas.
 */
describe('E1 audit 2: agent bookings need a valid offer AND attempt', () => {
  const clock = createControlledClock();
  const booking = new DrizzleMeetingBookingService(tdb.db, clock.now);
  const slots = new DrizzleSchedulingSlotRepository(tdb.db);
  const leads = new DrizzleLeadRepository(tdb.db);
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
    orgB = fx.tenantB.organizationId;
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function setup(org = orgA, tenant = fx?.tenantA) {
    clock.set(SCHEDULING_TEST_NOW);
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: org });
    const { lead, contact } = await createSyntheticLead(tdb.db, org);
    const attemptId = await prepareSyntheticAttempt(tdb.db, {
      tenant: tenant!,
      destinationPhone: contact.phoneE164,
    });
    return { calendar, lead, contact, attemptId };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;
  async function issue(s: Setup, sourceAttemptId?: string) {
    const offered = await slots.offerSlots({
      organizationId: s.calendar.organizationId,
      calendarId: s.calendar.id,
      leadId: s.lead.id,
      sourceAttemptId,
      now: SCHEDULING_TEST_NOW,
      from: TUESDAY_10,
      to: new Date('2026-12-02T03:00:00Z'),
      limit: 1,
    });
    if (offered.kind !== 'OFFERED') throw new Error(offered.kind);
    return offered.offers[0]!;
  }
  const confirm = (
    offerId: string,
    sourceAttemptId: string | undefined,
    actor: { type: 'AGENT' | 'USER'; id: string } = AGENT,
  ) =>
    booking.bookOfferedSlot({
      organizationId: orgA,
      offerId,
      sourceAttemptId,
      idempotencyKey: key(),
      actor,
    });
  const meetingsOf = async (leadId: string) =>
    tdb.db.select().from(meetings).where(eq(meetings.leadId, leadId));

  it('AGENT without an offer (free slot) is refused', async () => {
    const s = await setup();
    const outcome = await booking.bookMeeting({
      organizationId: orgA,
      calendarId: s.calendar.id,
      leadId: s.lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: AGENT,
    });
    expect(outcome).toEqual({ kind: 'OFFER_REQUIRED' });
  });

  it('AGENT with an offer issued WITHOUT attempt, confirming without attempt, is refused', async () => {
    const s = await setup();
    const offer = await issue(s);
    expect(offer.sourceAttemptId).toBeNull();
    expect(await confirm(offer.id, undefined)).toEqual({ kind: 'ATTEMPT_REQUIRED' });
    expect(await meetingsOf(s.lead.id)).toEqual([]);
  });

  it('AGENT confirming an attempt-bound offer without the attempt is refused', async () => {
    const s = await setup();
    const offer = await issue(s, s.attemptId);
    expect(await confirm(offer.id, undefined)).toEqual({ kind: 'ATTEMPT_REQUIRED' });
  });

  it('AGENT with a divergent attempt of the same phone is refused', async () => {
    const s = await setup();
    const offer = await issue(s, s.attemptId);
    const sibling = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantA,
      destinationPhone: s.contact.phoneE164,
    });
    expect(await confirm(offer.id, sibling)).toEqual({ kind: 'OFFER_NOT_FOUND' });
  });

  it('AGENT with an attempt that dialed ANOTHER lead is refused, also when the offer row itself is inconsistent', async () => {
    const s = await setup();
    const other = await setup();
    const offer = await issue(s, s.attemptId);
    expect(await confirm(offer.id, other.attemptId)).toEqual({ kind: 'OFFER_NOT_FOUND' });
    // Oferta forjada direto no banco (contorna offerSlots): a confirmação revalida a associação.
    const [forged] = await tdb.db
      .insert(meetingSlotOffers)
      .values({
        ...offer,
        id: randomUUID(),
        sourceAttemptId: other.attemptId,
        startsAt: new Date('2026-12-01T14:00:00Z'),
        endsAt: new Date('2026-12-01T14:30:00Z'),
        status: 'OFFERED',
      })
      .returning();
    expect(await confirm(forged!.id, other.attemptId)).toEqual({ kind: 'ATTEMPT_LEAD_MISMATCH' });
    expect(await meetingsOf(s.lead.id)).toEqual([]);
  });

  it('AGENT with an attempt of another organization is refused', async () => {
    const s = await setup();
    const offer = await issue(s, s.attemptId);
    const foreign = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantB,
      destinationPhone: s.contact.phoneE164,
    });
    expect(await confirm(offer.id, foreign)).toEqual({ kind: 'OFFER_NOT_FOUND' });
  });

  it('AGENT with a valid offer and attempt books; USER keeps the legitimate administrative booking', async () => {
    const s = await setup();
    const offer = await issue(s, s.attemptId);
    const booked = await confirm(offer.id, s.attemptId);
    expect(
      booked.kind === 'BOOKED' && [
        booked.meeting.slotOfferId,
        booked.meeting.sourceAttemptId,
        booked.meeting.bookedByType,
      ],
    ).toEqual([offer.id, s.attemptId, 'AGENT']);
    const admin = await setup();
    const manual = await booking.bookMeeting({
      organizationId: orgA,
      calendarId: admin.calendar.id,
      leadId: admin.lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: USER,
    });
    expect(
      manual.kind === 'BOOKED' && [manual.meeting.sourceAttemptId, manual.meeting.slotOfferId],
    ).toEqual([null, null]);
  });

  it('an offer issued before the phone was suppressed can no longer be confirmed by the agent', async () => {
    const s = await setup();
    const offer = await issue(s, s.attemptId);
    await suppressions.addSuppression({
      organizationId: orgA,
      phoneE164: s.contact.phoneE164,
      reason: 'OPT_OUT',
    });
    expect(await confirm(offer.id, s.attemptId)).toEqual({ kind: 'LEAD_SUPPRESSED' });
    const [row] = await tdb.db
      .select()
      .from(meetingSlotOffers)
      .where(eq(meetingSlotOffers.id, offer.id));
    expect(row!.status).toBe('OFFERED');
  });

  it('the same idempotency key in two organizations books two independent meetings', async () => {
    const a = await setup();
    const b = await setup(orgB, fx.tenantB);
    const shared = key();
    const book = (s: Setup) =>
      booking.bookMeeting({
        organizationId: s.calendar.organizationId,
        calendarId: s.calendar.id,
        leadId: s.lead.id,
        startsAt: TUESDAY_10,
        idempotencyKey: shared,
        actor: USER,
      });
    const [first, second] = [await book(a), await book(b)];
    expect([first.kind, second.kind]).toEqual(['BOOKED', 'BOOKED']);
    expect(
      first.kind === 'BOOKED' && second.kind === 'BOOKED' && first.meeting.id !== second.meeting.id,
    ).toBe(true);
  });

  it('rolls back an OFFER booking entirely on the exact induced failure (offer back to OFFERED)', async () => {
    const s = await setup();
    const offer = await issue(s, s.attemptId);
    await tdb.db.execute(
      sql.raw(`
      CREATE FUNCTION e1_fail_offer_booking() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'meeting.booked' THEN
          RAISE EXCEPTION 'e1_induced_offer_booking_failure' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER e1_fail_offer_booking BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION e1_fail_offer_booking();`),
    );
    let failure: unknown = null;
    try {
      await confirm(offer.id, s.attemptId).catch((error: unknown) => {
        failure = error;
      });
    } finally {
      await tdb.db.execute(
        sql.raw(
          'DROP TRIGGER e1_fail_offer_booking ON audit_logs; DROP FUNCTION e1_fail_offer_booking();',
        ),
      );
    }
    expect(postgresError(failure)).toEqual({
      code: 'P0001',
      message: 'e1_induced_offer_booking_failure',
    });
    const [row] = await tdb.db
      .select()
      .from(meetingSlotOffers)
      .where(eq(meetingSlotOffers.id, offer.id));
    expect(row!.status).toBe('OFFERED');
    expect(await meetingsOf(s.lead.id)).toEqual([]);
    const view = await leads.getLead(orgA, s.lead.id);
    expect([view!.status, view!.statusVersion, view!.history.length]).toEqual(['NEW', 1, 1]);
    const audits = await tdb.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, orgA), eq(auditLogs.action, 'meeting.booked')));
    const forOffer = audits.filter(
      (a) => (JSON.parse(a.metadata ?? '{}') as { slotOfferId?: string }).slotOfferId === offer.id,
    );
    expect(forOffer).toEqual([]);
    // Depois do rollback, a mesma oferta ainda pode ser confirmada uma única vez.
    expect((await confirm(offer.id, s.attemptId)).kind).toBe('BOOKED');
  });
});
