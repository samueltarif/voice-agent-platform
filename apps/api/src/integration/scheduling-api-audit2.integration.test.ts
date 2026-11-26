import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from '@voice-agent/database';
import {
  countPhoneSuppressions,
  createDisposableTestDatabase,
  createDurableOutboundFixture,
  createSyntheticContact,
  prepareSyntheticAttempt,
  SCHEDULING_TEST_NOW,
  type DurableOutboundFixture,
} from '@voice-agent/database/test-support';
import { createSchedulingApiHarness, type SchedulingApiHarness } from './scheduling-api-harness.js';

const tdb = await createDisposableTestDatabase('scheduling-api-audit2');
const policy = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  minimumNoticeMinutes: 60,
  bookingHorizonDays: 30,
};
const RANGE = 'from=2026-11-30T00:00:00Z&to=2026-12-31T00:00:00Z';

/**
 * 2ª auditoria E1 — bloqueante 1 (A4) pela ROTA HTTP real: opt-out com versão
 * comercial desatualizada; e ressalva B1: histórico do lead projetado por
 * permissão.
 */
describe('E1 audit 2: opt-out over HTTP and lead history projection', () => {
  let fx: DurableOutboundFixture;
  let api: SchedulingApiHarness;
  let orgA: string;
  let orgB: string;
  const attempts = new DrizzleCallAttemptRepository(tdb.db);

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
    orgB = fx.tenantB.organizationId;
    api = await createSchedulingApiHarness({
      db: tdb.db,
      activeOrganizations: [orgA, orgB],
      now: SCHEDULING_TEST_NOW,
    });
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function calendar() {
    api.role = 'MANAGER';
    const created = await api.post('/v1/scheduling/calendars', orgA, {
      name: `Audit2 ${randomUUID().slice(0, 6)}`,
      ...policy,
    });
    const id = created.json.calendar!.id;
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '12:00' }));
    await api.put(`/v1/scheduling/calendars/${id}/availability`, orgA, {
      expectedVersion: 1,
      rules,
    });
    return id;
  }

  async function lead() {
    const contact = await createSyntheticContact(tdb.db, orgA);
    api.role = 'OPERATOR';
    const id = (await api.post('/v1/leads', orgA, { contactId: contact.id })).json.lead!.id;
    return { id, phone: contact.phoneE164 };
  }

  /** Supressão canônica lida direto do banco descartável (fonte consultada no disparo). */
  const suppressionsOf = (organizationId: string, phoneE164: string) =>
    countPhoneSuppressions(tdb.db, { organizationId, phoneE164 });
  const optOut = (leadId: string, expectedVersion: number, org = orgA) =>
    api.post(`/v1/leads/${leadId}/status`, org, { status: 'DO_NOT_CALL', expectedVersion });

  it('an opt-out with a STALE version still reaches the canonical suppression and blocks queued calls', async () => {
    const calendarId = await calendar();
    const target = await lead();
    const queued = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantA,
      destinationPhone: target.phone,
    });
    api.role = 'OPERATOR';
    // Operador abriu o lead na versão 1; uma reserva concorrente leva o lead à versão 2.
    const booked = await api.post('/v1/scheduling/meetings', orgA, {
      calendarId,
      leadId: target.id,
      startsAt: '2026-12-01T10:00:00-03:00',
      idempotencyKey: `ui-${randomUUID()}`,
    });
    expect(booked.status).toBe(201);
    const stale = await optOut(target.id, 1);
    expect([stale.status, stale.json.status]).toEqual([200, 'OPTED_OUT_MEETING_PRESERVED']);
    expect(await suppressionsOf(orgA, target.phone)).toBe(1);
    const listed = await api.get(`/v1/scheduling/meetings?calendarId=${calendarId}&${RANGE}`, orgA);
    expect(listed.json.items!.map((m) => m.status)).toEqual(['SCHEDULED']);
    const claim = await attempts.claimSend({
      organizationId: orgA,
      attemptId: queued,
      ownerId: 'worker-audit2-http',
      leaseMs: 60_000,
      eventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    expect(claim).toEqual({ kind: 'REJECTED', reason: 'DESTINATION_SUPPRESSED' });
    // Repetição idempotente: mesmo resultado, uma única supressão.
    const repeated = await optOut(target.id, 1);
    expect([repeated.status, repeated.json.status]).toEqual([200, 'OPTED_OUT_MEETING_PRESERVED']);
    expect(await suppressionsOf(orgA, target.phone)).toBe(1);
    // Cancelamento posterior não reativa ligações.
    const canceled = await api.post(
      `/v1/scheduling/meetings/${booked.json.meeting!.id}/cancel`,
      orgA,
      { expectedVersion: 1 },
    );
    expect(canceled.status).toBe(200);
    const view = await api.get(`/v1/leads/${target.id}`, orgA);
    expect([view.json.status, view.json.phoneSuppressed]).toEqual(['DO_NOT_CALL', true]);
    const again = await optOut(target.id, 1);
    expect([again.status, again.json.status]).toEqual([200, 'ALREADY_DO_NOT_CALL']);
    expect(await suppressionsOf(orgA, target.phone)).toBe(1);
  });

  it('keeps version control for every other commercial change', async () => {
    const target = await lead();
    api.role = 'OPERATOR';
    expect(
      (
        await api.post(`/v1/leads/${target.id}/status`, orgA, {
          status: 'CONTACTED',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(200);
    const stale = await api.post(`/v1/leads/${target.id}/status`, orgA, {
      status: 'QUALIFIED',
      expectedVersion: 1,
    });
    expect([stale.status, stale.json.error!.code]).toEqual([409, 'VERSION_CONFLICT']);
  });

  it('isolation and permissions: VIEWER and another organization cannot opt a lead out', async () => {
    const target = await lead();
    api.role = 'VIEWER';
    expect((await optOut(target.id, 1)).status).toBe(403);
    api.role = 'OWNER';
    const crossed = await optOut(target.id, 1, orgB);
    expect([crossed.status, crossed.json.error!.code]).toEqual([404, 'LEAD_NOT_FOUND']);
    expect(await suppressionsOf(orgA, target.phone)).toBe(0);
    expect(await suppressionsOf(orgB, target.phone)).toBe(0);
    expect((await api.get(`/v1/leads/${target.id}`, orgA)).json.status).toBe('NEW');
  });

  it('B1: the lead history hides actor ids and free text from VIEWER and OPERATOR, not from MANAGER', async () => {
    const target = await lead();
    api.role = 'OPERATOR';
    await api.post(`/v1/leads/${target.id}/status`, orgA, {
      status: 'CONTACTED',
      expectedVersion: 1,
      reason: 'texto livre',
    });
    for (const role of ['VIEWER', 'OPERATOR'] as const) {
      api.role = role;
      const history = (await api.get(`/v1/leads/${target.id}`, orgA)).json.history!;
      expect(history).toHaveLength(2);
      for (const entry of history) {
        for (const hidden of ['actorId', 'reason', 'organizationId', 'id'])
          expect(entry).not.toHaveProperty(hidden);
        expect(entry).toMatchObject({
          toStatus: expect.any(String),
          origin: expect.any(String),
          actorType: 'USER',
        });
      }
    }
    api.role = 'MANAGER';
    const managed = (await api.get(`/v1/leads/${target.id}`, orgA)).json.history!;
    expect(managed[1]).toMatchObject({
      toStatus: 'CONTACTED',
      reason: 'texto livre',
      actorId: expect.any(String),
    });
  });
});
