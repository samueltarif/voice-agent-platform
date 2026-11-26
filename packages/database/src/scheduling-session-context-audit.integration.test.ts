import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import { DrizzleSchedulingSessionContextResolver } from './repositories/scheduling-session-context-resolver.js';
import { outboundCampaigns } from './schema/outbound.js';
import { schedulingCalendars } from './schema/scheduling-calendars.js';
import { schedulingSessionContexts } from './schema/scheduling-session-contexts.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  createPublishedAgent,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createSyntheticLead, createWeekdayCalendar } from './test-support/scheduling-fixtures.js';
import { createBoundCallSession } from './test-support/scheduling-session-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-context-audit');

/** Barreira observável: o resolvedor PARA no ponto marcado até o teste liberar. */
function barrier(parties = 1) {
  let arrived = 0;
  let notifyReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((r) => (notifyReached = r));
  const released = new Promise<void>((r) => (release = r));
  return {
    reached,
    release,
    async hold() {
      arrived += 1;
      if (arrived === parties) notifyReached();
      await released;
    },
  };
}

describe('E2 PR1 audit: D1 race, pin contention and CHECK constraint', () => {
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  /** Empresa própria do cenário (padrão da empresa isolado). */
  async function scenario() {
    const org = (
      await tdb.db.execute(
        sql`INSERT INTO organizations (slug, name, status) VALUES (${`e2-race-${randomUUID().slice(0, 8)}`}, 'E2 race', 'ACTIVE') RETURNING id`,
      )
    ).rows[0] as { id: string };
    const agent = await createPublishedAgent(tdb.db, org.id, fx.userId);
    const tenant: TenantFixture = { ...fx.tenantA, organizationId: org.id, ...agent };
    const { contact } = await createSyntheticLead(tdb.db, org.id);
    const calendar = async () =>
      (await createWeekdayCalendar(tdb.db, { organizationId: org.id })).id;
    return { tenant, phone: contact.phoneE164, calendar };
  }

  const query = (tenant: TenantFixture, sessionId: string) => ({
    organizationId: tenant.organizationId,
    sessionId,
    agentId: tenant.agentId,
    agentVersionId: tenant.agentVersionId,
  });

  it('A4: a concurrent change between priority reads can never pin an inconsistent calendar', async () => {
    const s = await scenario();
    const a = await s.calendar();
    const b = await s.calendar();
    const c = await s.calendar();
    await tdb.db
      .update(schedulingCalendars)
      .set({ isOrganizationDefault: true })
      .where(eq(schedulingCalendars.id, a));
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
    });
    const pause = barrier();
    const resolver = new DrizzleSchedulingSessionContextResolver(tdb.db, {
      hooks: { afterCampaignLookup: () => pause.hold() },
    });
    const pending = resolver.resolve(query(s.tenant, session.sessionId));
    await pause.reached; // resolvedor já leu a campanha (sem agenda)
    // Outra transação, em outra conexão: campanha passa a C e o padrão troca de A para B.
    await tdb.db.transaction(async (tx) => {
      await tx
        .update(outboundCampaigns)
        .set({ schedulingCalendarId: c })
        .where(eq(outboundCampaigns.id, session.campaignId!));
      await tx
        .update(schedulingCalendars)
        .set({ isOrganizationDefault: false })
        .where(eq(schedulingCalendars.id, a));
      await tx
        .update(schedulingCalendars)
        .set({ isOrganizationDefault: true })
        .where(eq(schedulingCalendars.id, b));
    });
    pause.release();
    const context = await pending;
    if (context.kind !== 'BOUND') throw new Error(context.reason);
    // D1 sobre a visão ANTERIOR à mudança = A; sobre a posterior = C. B é impossível.
    expect(context.calendar).toEqual({
      kind: 'RESOLVED',
      calendarId: a,
      source: 'ORGANIZATION_DEFAULT',
    });
    const [pinned] = await tdb.db
      .select()
      .from(schedulingSessionContexts)
      .where(eq(schedulingSessionContexts.sessionId, session.sessionId));
    expect(pinned!.calendarId).toBe(a);
  });

  it('A4: simultaneous resolvers of the same session converge on ONE pinned row', async () => {
    const s = await scenario();
    const first = await s.calendar();
    await tdb.db
      .update(schedulingCalendars)
      .set({ isOrganizationDefault: true })
      .where(eq(schedulingCalendars.id, first));
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
    });
    const gate = barrier(2);
    const make = () =>
      new DrizzleSchedulingSessionContextResolver(tdb.db, {
        hooks: { beforePin: () => gate.hold() },
      });
    const both = Promise.all([
      make().resolve(query(s.tenant, session.sessionId)),
      make().resolve(query(s.tenant, session.sessionId)),
    ]);
    await gate.reached; // os dois calcularam e vão disputar a PK
    gate.release();
    const [x, y] = await both;
    expect(x).toEqual(y);
    const rows = await tdb.db
      .select()
      .from(schedulingSessionContexts)
      .where(eq(schedulingSessionContexts.sessionId, session.sessionId));
    expect(rows).toHaveLength(1);
  });

  it('M3: the CHECK rejects every inconsistent combination and accepts the valid ones', async () => {
    const s = await scenario();
    const cal = await s.calendar();
    const row = async (values: Record<string, unknown>) => {
      const session = await createBoundCallSession(tdb.db, {
        tenant: s.tenant,
        destinationPhone: s.phone,
      });
      return tdb.db
        .insert(schedulingSessionContexts)
        .values({
          organizationId: s.tenant.organizationId,
          sessionId: session.sessionId,
          agentVersionId: s.tenant.agentVersionId,
          resolution: 'ABSENT',
          ...values,
        })
        .then(
          () => 'OK',
          (error: unknown) => classifyPostgresFailure(error).constraint,
        );
    };
    const CHK = 'scheduling_session_contexts_resolution_chk';
    expect(
      await row({ resolution: 'BLOCKED', calendarSource: 'CAMPAIGN', blockedReason: null }),
    ).toBe(CHK);
    expect(
      await row({
        resolution: 'BLOCKED',
        calendarSource: 'CAMPAIGN',
        blockedReason: 'CALENDAR_NOT_FOUND',
        calendarId: cal,
      }),
    ).toBe(CHK);
    expect(
      await row({
        resolution: 'BLOCKED',
        calendarSource: null,
        blockedReason: 'CALENDAR_NOT_FOUND',
      }),
    ).toBe(CHK);
    expect(
      await row({ resolution: 'BLOCKED', calendarSource: 'CAMPAIGN', blockedReason: 'OTHER' }),
    ).toBe(CHK);
    expect(
      await row({ resolution: 'RESOLVED', calendarSource: 'CAMPAIGN', calendarId: null }),
    ).toBe(CHK);
    expect(await row({ resolution: 'RESOLVED', calendarSource: null, calendarId: cal })).toBe(CHK);
    expect(
      await row({
        resolution: 'RESOLVED',
        calendarSource: 'CAMPAIGN',
        calendarId: cal,
        blockedReason: 'CALENDAR_NOT_FOUND',
      }),
    ).toBe(CHK);
    expect(await row({ resolution: 'ABSENT', calendarId: cal })).toBe(CHK);
    expect(await row({ resolution: 'ABSENT', calendarSource: 'CAMPAIGN' })).toBe(CHK);
    expect(await row({ resolution: 'OTHER' })).toBe(CHK);
    expect(await row({ resolution: 'RESOLVED', calendarSource: 'CAMPAIGN', calendarId: cal })).toBe(
      'OK',
    );
    expect(await row({ resolution: 'ABSENT' })).toBe('OK');
    expect(
      await row({
        resolution: 'BLOCKED',
        calendarSource: 'AGENT_VERSION',
        blockedReason: 'AGENT_CONFIGURATION_INVALID',
      }),
    ).toBe('OK');
  });
});
