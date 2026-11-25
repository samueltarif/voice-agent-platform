import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { DrizzleMeetingCancellationService } from './repositories/meeting-cancellation-service.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
import { isAttemptDestinationSuppressed } from './repositories/send-time-suppression-guard.js';
import { callAttempts } from './schema/call-attempts.js';
import { contactSuppressions } from './schema/contacts.js';
import { meetings } from './schema/meetings.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createSyntheticLead,
  createWeekdayCalendar,
  prepareSyntheticAttempt,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('meeting-audit-optout');
const at = (value: string) => new Date(value);
const key = () => `test-${randomUUID()}`;
const TUESDAY_10 = at('2026-12-01T13:00:00.000Z');
const USER = SCHEDULING_TEST_USER;

/**
 * Auditoria E1 — A4: o pedido de não receber ligações sempre chega à supressão
 * canônica, com ou sem reunião ativa, e nunca é removido implicitamente.
 * Reserva manual pedida pelo próprio cliente continua possível; oferta e
 * reserva do agente (prospecção ativa) são recusadas para telefone suprimido.
 */
describe('E1 audit: opt-out reaches the canonical suppression', () => {
  const booking = new DrizzleMeetingBookingService(tdb.db, () => SCHEDULING_TEST_NOW);
  const cancellation = new DrizzleMeetingCancellationService(tdb.db);
  const leads = new DrizzleLeadRepository(tdb.db);
  const slots = new DrizzleSchedulingSlotRepository(tdb.db);
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function suppressed(phoneE164: string) {
    const rows = await tdb.db
      .select()
      .from(contactSuppressions)
      .where(
        and(
          eq(contactSuppressions.organizationId, orgA),
          eq(contactSuppressions.phoneE164, phoneE164),
        ),
      );
    return rows.length === 1;
  }

  async function setup() {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead, contact } = await createSyntheticLead(tdb.db, orgA);
    return { calendar, lead, contact };
  }

  const optOut = (leadId: string, expectedVersion: number) =>
    leads.changeLeadStatus({
      organizationId: orgA,
      leadId,
      status: 'DO_NOT_CALL',
      expectedVersion,
      actor: USER,
      reason: 'pediu para não ligar',
    });

  const offer = (input: { calendarId: string; leadId: string; sourceAttemptId?: string }) =>
    slots.offerSlots({
      organizationId: orgA,
      ...input,
      now: SCHEDULING_TEST_NOW,
      from: TUESDAY_10,
      to: at('2026-12-02T03:00:00Z'),
      limit: 1,
    });

  it('opt-out BEFORE booking: agent offers are refused; a manual booking keeps the suppression', async () => {
    const { calendar, lead, contact } = await setup();
    expect((await optOut(lead.id, 1)).kind).toBe('CHANGED');
    expect(await suppressed(contact.phoneE164)).toBe(true);
    expect(await offer({ calendarId: calendar.id, leadId: lead.id })).toEqual({
      kind: 'LEAD_SUPPRESSED',
    });
    const manual = await booking.bookMeeting({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: USER,
    });
    expect(manual.kind).toBe('BOOKED');
    expect(await suppressed(contact.phoneE164)).toBe(true);
  });

  it('booking BEFORE opt-out: the meeting is preserved, the phone is suppressed, cancel does not re-enable calls', async () => {
    const { calendar, lead, contact } = await setup();
    const booked = await booking.bookMeeting({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: USER,
    });
    if (booked.kind !== 'BOOKED') throw new Error(booked.kind);
    const opted = await optOut(lead.id, 2);
    expect(opted).toMatchObject({ kind: 'OPTED_OUT_MEETING_PRESERVED' });
    expect(await suppressed(contact.phoneE164)).toBe(true);
    const [meeting] = await tdb.db
      .select()
      .from(meetings)
      .where(eq(meetings.id, booked.meeting.id));
    expect(meeting!.status).toBe('SCHEDULED');
    const canceled = await cancellation.cancelMeeting({
      organizationId: orgA,
      meetingId: booked.meeting.id,
      expectedVersion: 1,
      actor: USER,
      now: SCHEDULING_TEST_NOW,
    });
    expect(canceled.kind).toBe('CANCELED');
    expect((await leads.getLead(orgA, lead.id))!.status).toBe('DO_NOT_CALL');
    expect(await suppressed(contact.phoneE164)).toBe(true);
  });

  it('blocks a call already queued for the phone before the opt-out', async () => {
    const { lead, contact } = await setup();
    const attemptId = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantA,
      destinationPhone: contact.phoneE164,
    });
    const [row] = await tdb.db.select().from(callAttempts).where(eq(callAttempts.id, attemptId));
    expect(await isAttemptDestinationSuppressed(tdb.db, row!)).toBe(false);
    expect((await optOut(lead.id, 1)).kind).toBe('CHANGED');
    expect(await isAttemptDestinationSuppressed(tdb.db, row!)).toBe(true);
  });

  it('honours a suppression registered through the contacts API', async () => {
    const { calendar, lead, contact } = await setup();
    const attemptId = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantA,
      destinationPhone: contact.phoneE164,
    });
    await suppressions.addSuppression({
      organizationId: orgA,
      phoneE164: contact.phoneE164,
      reason: 'OPT_OUT',
    });
    expect(
      await offer({ calendarId: calendar.id, leadId: lead.id, sourceAttemptId: attemptId }),
    ).toEqual({ kind: 'LEAD_SUPPRESSED' });
    expect((await leads.getLead(orgA, lead.id))!.phoneSuppressed).toBe(true);
  });

  it('never loses the opt-out when it races a booking', async () => {
    for (let round = 0; round < 5; round += 1) {
      const { calendar, lead, contact } = await setup();
      const outcomes = await Promise.all([
        booking.bookMeeting({
          organizationId: orgA,
          calendarId: calendar.id,
          leadId: lead.id,
          startsAt: TUESDAY_10,
          idempotencyKey: key(),
          actor: USER,
        }),
        leads.recordOptOut({ organizationId: orgA, leadId: lead.id, actor: USER }),
      ]);
      expect(outcomes[1].kind).not.toBe('NOT_FOUND');
      expect(await suppressed(contact.phoneE164)).toBe(true);
    }
  });
});
