import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposableTestDatabase,
  createDurableOutboundFixture,
  createSyntheticContact,
  SCHEDULING_TEST_NOW,
  type DurableOutboundFixture,
} from '@voice-agent/database/test-support';
import { createSchedulingApiHarness, type SchedulingApiHarness } from './scheduling-api-harness.js';

const tdb = await createDisposableTestDatabase('scheduling-api-audit');
const policy = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  minimumNoticeMinutes: 60,
  bookingHorizonDays: 30,
};
const TUESDAY_SLOTS = '/slots?from=2026-12-01T03:00:00Z&to=2026-12-02T03:00:00Z&limit=2';
const NEVER_EXPOSED = ['idempotencyKey', 'requestFingerprint', 'slotOfferId'];
const MANAGE_ONLY = [
  'bookedById',
  'canceledByType',
  'canceledById',
  'cancelReason',
  'sourceAttemptId',
];

/** Auditoria E1 — M1, B1, MANAGER, vínculo revogado, sem autenticação e cancelamento cruzado. */
describe('E1 audit: scheduling API (HTTP + PostgreSQL)', () => {
  let fx: DurableOutboundFixture;
  let api: SchedulingApiHarness;
  let orgA: string;
  let orgB: string;

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
      name: `Audit ${randomUUID().slice(0, 6)}`,
      ...policy,
    });
    const id = created.json.calendar!.id;
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '12:00' }));
    expect(
      (
        await api.put(`/v1/scheduling/calendars/${id}/availability`, orgA, {
          expectedVersion: 1,
          rules,
        })
      ).status,
    ).toBe(200);
    return id;
  }

  async function lead() {
    const contact = await createSyntheticContact(tdb.db, orgA);
    api.role = 'OPERATOR';
    return (await api.post('/v1/leads', orgA, { contactId: contact.id })).json.lead!.id;
  }

  const book = (calendarId: string, leadId: string, startsAt = '2026-12-01T10:00:00-03:00') =>
    api.post('/v1/scheduling/meetings', orgA, {
      calendarId,
      leadId,
      startsAt,
      idempotencyKey: `ui-${randomUUID()}`,
    });

  it('M1: an exception created through the API can be found and removed through the API', async () => {
    const calendarId = await calendar();
    expect(
      (await api.get(`/v1/scheduling/calendars/${calendarId}${TUESDAY_SLOTS}`, orgA)).json.items,
    ).toHaveLength(2);
    const added = await api.post(`/v1/scheduling/calendars/${calendarId}/exceptions`, orgA, {
      expectedVersion: 2,
      exception: { date: '2026-12-01', kind: 'UNAVAILABLE' },
    });
    expect(added.status).toBe(200);
    expect(
      (await api.get(`/v1/scheduling/calendars/${calendarId}${TUESDAY_SLOTS}`, orgA)).json.items,
    ).toEqual([]);
    const detail = await api.get(`/v1/scheduling/calendars/${calendarId}`, orgA);
    const exception = detail.json.exceptions!.find((e) => e.localDate === '2026-12-01');
    expect(exception?.id).toMatch(/^[0-9a-f-]{36}$/);
    const removed = await api.delete(
      `/v1/scheduling/calendars/${calendarId}/exceptions/${exception!.id}?expectedVersion=3`,
      orgA,
    );
    expect(removed.status).toBe(200);
    expect(
      (await api.get(`/v1/scheduling/calendars/${calendarId}${TUESDAY_SLOTS}`, orgA)).json.items,
    ).toHaveLength(2);
  });

  it('B1: projects meetings per permission and never returns idempotency data', async () => {
    const calendarId = await calendar();
    const leadId = await lead();
    api.role = 'OPERATOR';
    const booked = await book(calendarId, leadId);
    expect(booked.status).toBe(201);
    for (const field of [...NEVER_EXPOSED, ...MANAGE_ONLY])
      expect(booked.json.meeting).not.toHaveProperty(field);
    const canceled = await api.post(
      `/v1/scheduling/meetings/${booked.json.meeting!.id}/cancel`,
      orgA,
      { expectedVersion: 1, reason: 'texto livre' },
    );
    expect(canceled.json.meeting).not.toHaveProperty('cancelReason');
    const list = (role: 'VIEWER' | 'MANAGER') => {
      api.role = role;
      return api.get(
        `/v1/scheduling/meetings?calendarId=${calendarId}&from=2026-11-30T00:00:00Z&to=2026-12-31T00:00:00Z`,
        orgA,
      );
    };
    const viewer = (await list('VIEWER')).json.items![0]!;
    for (const field of [...NEVER_EXPOSED, ...MANAGE_ONLY])
      expect(viewer).not.toHaveProperty(field);
    expect(viewer).toMatchObject({
      id: booked.json.meeting!.id,
      status: 'CANCELED',
      contactName: expect.any(String),
    });
    const manager = (await list('MANAGER')).json.items![0]!;
    for (const field of NEVER_EXPOSED) expect(manager).not.toHaveProperty(field);
    expect(manager).toMatchObject({
      cancelReason: 'texto livre',
      sourceAttemptId: null,
      bookedById: expect.any(String),
    });
  });

  it('MANAGER configures calendars, books, cancels and changes lead status', async () => {
    const calendarId = await calendar();
    const leadId = await lead();
    api.role = 'MANAGER';
    expect(
      (
        await api.put(`/v1/scheduling/calendars/${calendarId}/policy`, orgA, {
          ...policy,
          expectedVersion: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api.post(`/v1/leads/${leadId}/status`, orgA, {
          status: 'CONTACTED',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(200);
    const booked = await book(calendarId, leadId);
    expect(booked.status).toBe(201);
    expect(
      (
        await api.post(`/v1/scheduling/meetings/${booked.json.meeting!.id}/cancel`, orgA, {
          expectedVersion: 1,
        })
      ).status,
    ).toBe(200);
  });

  it('refuses a revoked membership and an unauthenticated request', async () => {
    const calendarId = await calendar();
    const leadId = await lead();
    api.role = 'OWNER';
    api.membershipStatus = 'SUSPENDED';
    try {
      expect((await api.get('/v1/leads', orgA)).status).toBe(403);
      expect((await book(calendarId, leadId)).status).toBe(403);
    } finally {
      api.membershipStatus = 'ACTIVE';
    }
    expect((await api.anonymous('GET', '/v1/leads')).status).toBe(401);
    expect((await api.anonymous('POST', '/v1/scheduling/meetings')).status).toBe(401);
    expect((await api.get(`/v1/leads/${leadId}`, orgA)).json.status).toBe('NEW');
  });

  it('cannot cancel a meeting of another organization', async () => {
    const calendarId = await calendar();
    const leadId = await lead();
    api.role = 'OWNER';
    const booked = await book(calendarId, leadId);
    const crossed = await api.post(
      `/v1/scheduling/meetings/${booked.json.meeting!.id}/cancel`,
      orgB,
      { expectedVersion: 1 },
    );
    expect([crossed.status, crossed.json.error!.code]).toEqual([404, 'MEETING_NOT_FOUND']);
    const listed = await api.get(
      `/v1/scheduling/meetings?calendarId=${calendarId}&from=2026-11-30T00:00:00Z&to=2026-12-31T00:00:00Z`,
      orgA,
    );
    expect(listed.json.items![0]).toMatchObject({
      id: booked.json.meeting!.id,
      status: 'SCHEDULED',
      version: 1,
    });
  });

  it('A4: an opt-out with an active meeting keeps the meeting and suppresses the phone', async () => {
    const calendarId = await calendar();
    const leadId = await lead();
    api.role = 'OPERATOR';
    expect((await book(calendarId, leadId)).status).toBe(201);
    const opted = await api.post(`/v1/leads/${leadId}/status`, orgA, {
      status: 'DO_NOT_CALL',
      expectedVersion: 2,
    });
    expect([opted.status, opted.json.status]).toEqual([200, 'OPTED_OUT_MEETING_PRESERVED']);
    const view = await api.get(`/v1/leads/${leadId}`, orgA);
    expect(view.json).toMatchObject({ status: 'MEETING_SCHEDULED', phoneSuppressed: true });
  });
});
