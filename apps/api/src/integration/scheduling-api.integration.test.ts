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

const tdb = await createDisposableTestDatabase('scheduling-api-e1');
const policy = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  minimumNoticeMinutes: 60,
  bookingHorizonDays: 30,
};

/** E1 (DEC-074) — API de leads, agendas e reuniões: HTTP real + PostgreSQL. */
describe('E1 scheduling API (HTTP + PostgreSQL)', () => {
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

  async function calendarWithMornings(orgId = orgA) {
    api.role = 'MANAGER';
    const created = await api.post('/v1/scheduling/calendars', orgId, {
      name: `Demo ${randomUUID().slice(0, 6)}`,
      ...policy,
    });
    expect(created.status).toBe(201);
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '12:00' }));
    const replaced = await api.put(
      `/v1/scheduling/calendars/${created.json.calendar!.id}/availability`,
      orgId,
      { expectedVersion: 1, rules },
    );
    expect(replaced.status).toBe(200);
    return created.json.calendar!.id;
  }

  async function leadFor(orgId = orgA) {
    const contact = await createSyntheticContact(tdb.db, orgId);
    api.role = 'OPERATOR';
    const created = await api.post('/v1/leads', orgId, { contactId: contact.id });
    expect(created.status).toBe(201);
    return created.json.lead!.id;
  }

  it('runs the full flow: calendar → slots → booking → replay → cancel', async () => {
    const calendarId = await calendarWithMornings();
    const leadId = await leadFor();
    api.role = 'VIEWER';
    const slots = await api.get(
      `/v1/scheduling/calendars/${calendarId}/slots?from=2026-12-01T03:00:00Z&to=2026-12-02T03:00:00Z&limit=3`,
      orgA,
    );
    expect(slots.status).toBe(200);
    expect(slots.json.items!.map((s) => s.startsAt)).toEqual([
      '2026-12-01T12:00:00.000Z',
      '2026-12-01T12:30:00.000Z',
      '2026-12-01T13:00:00.000Z',
    ]);
    api.role = 'OPERATOR';
    const request = {
      calendarId,
      leadId,
      startsAt: '2026-12-01T09:30:00-03:00',
      idempotencyKey: `ui-${randomUUID()}`,
    };
    const booked = await api.post('/v1/scheduling/meetings', orgA, request);
    expect([booked.status, booked.json.status]).toEqual([201, 'BOOKED']);
    const replay = await api.post('/v1/scheduling/meetings', orgA, request);
    expect([replay.status, replay.json.meeting!.id]).toEqual([200, booked.json.meeting!.id]);
    const lead = await api.get(`/v1/leads/${leadId}`, orgA);
    expect(lead.json.status).toBe('MEETING_SCHEDULED');
    const conflict = await api.post(
      `/v1/scheduling/meetings/${booked.json.meeting!.id}/cancel`,
      orgA,
      { expectedVersion: 9 },
    );
    expect([conflict.status, conflict.json.error!.code]).toEqual([409, 'VERSION_CONFLICT']);
    const canceled = await api.post(
      `/v1/scheduling/meetings/${booked.json.meeting!.id}/cancel`,
      orgA,
      { expectedVersion: 1, reason: 'remarcar' },
    );
    expect([canceled.status, canceled.json.status]).toEqual([200, 'CANCELED']);
  });

  it('returns stable rejection codes for unavailable slots and blocked status changes', async () => {
    const calendarId = await calendarWithMornings();
    const leadId = await leadFor();
    const outside = await api.post('/v1/scheduling/meetings', orgA, {
      calendarId,
      leadId,
      startsAt: '2026-12-01T15:00:00-03:00',
      idempotencyKey: `ui-${randomUUID()}`,
    });
    expect([outside.status, outside.json.error]).toEqual([
      409,
      expect.objectContaining({ code: 'SLOT_UNAVAILABLE', reason: 'OUTSIDE_AVAILABILITY' }),
    ]);
    const manual = await api.post(`/v1/leads/${leadId}/status`, orgA, {
      status: 'MEETING_SCHEDULED',
      expectedVersion: 1,
    });
    expect([manual.status, manual.json.error]).toEqual([
      409,
      expect.objectContaining({
        code: 'STATUS_CHANGE_BLOCKED',
        reason: 'STATUS_MANAGED_BY_SCHEDULING',
      }),
    ]);
    const invalid = await api.post('/v1/scheduling/meetings', orgA, {
      calendarId,
      leadId,
      startsAt: '2026-02-30T10:00:00Z',
      idempotencyKey: `ui-${randomUUID()}`,
    });
    expect(invalid.status).toBe(400);
  });

  it('enforces RBAC: viewers read, operators book, only managers configure', async () => {
    const calendarId = await calendarWithMornings();
    const leadId = await leadFor();
    api.role = 'VIEWER';
    expect((await api.get('/v1/leads', orgA)).status).toBe(200);
    expect(
      (
        await api.get(
          '/v1/scheduling/meetings?from=2026-11-01T00:00:00Z&to=2026-12-31T00:00:00Z',
          orgA,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await api.post('/v1/scheduling/meetings', orgA, {
          calendarId,
          leadId,
          startsAt: '2026-12-02T10:00:00-03:00',
          idempotencyKey: `ui-${randomUUID()}`,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api.post(`/v1/leads/${leadId}/status`, orgA, {
          status: 'CONTACTED',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(403);
    api.role = 'OPERATOR';
    expect(
      (await api.post('/v1/scheduling/calendars', orgA, { name: 'Proibida', ...policy })).status,
    ).toBe(403);
    expect(
      (
        await api.put(`/v1/scheduling/calendars/${calendarId}/policy`, orgA, {
          ...policy,
          expectedVersion: 2,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api.post('/v1/scheduling/meetings', orgA, {
          calendarId,
          leadId,
          startsAt: '2026-12-02T10:00:00-03:00',
          idempotencyKey: `ui-${randomUUID()}`,
        })
      ).status,
    ).toBe(201);
    api.role = 'ADMIN';
    expect(
      (
        await api.post(`/v1/scheduling/calendars/${calendarId}/exceptions`, orgA, {
          expectedVersion: 2,
          exception: { date: '2026-12-24', kind: 'UNAVAILABLE' },
        })
      ).status,
    ).toBe(200);
  });

  it('documents the new routes in the OpenAPI contract', async () => {
    const doc = await api.get('/openapi.json', orgA);
    expect(doc.status).toBe(200);
    expect(Object.keys(doc.json.paths!)).toEqual(
      expect.arrayContaining([
        '/v1/leads',
        '/v1/scheduling/calendars/{calendarId}/availability',
        '/v1/scheduling/meetings',
      ]),
    );
  });

  it('never exposes or changes data of another organization', async () => {
    const calendarId = await calendarWithMornings(orgA);
    const leadId = await leadFor(orgA);
    api.role = 'OWNER';
    expect((await api.get(`/v1/scheduling/calendars/${calendarId}`, orgB)).status).toBe(404);
    expect((await api.get(`/v1/leads/${leadId}`, orgB)).status).toBe(404);
    const crossed = await api.post('/v1/scheduling/meetings', orgB, {
      calendarId,
      leadId,
      startsAt: '2026-12-03T10:00:00-03:00',
      idempotencyKey: `ui-${randomUUID()}`,
    });
    expect([crossed.status, crossed.json.error!.code]).toEqual([404, 'LEAD_NOT_FOUND']);
    const foreignContact = await createSyntheticContact(tdb.db, orgA);
    expect((await api.post('/v1/leads', orgB, { contactId: foreignContact.id })).status).toBe(404);
    expect((await api.get('/v1/leads', 'f0e1d2c3-b4a5-4697-8899-aabbccddeeff')).status).toBe(403);
  });
});
