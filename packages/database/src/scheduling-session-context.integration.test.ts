import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallSessionRepository } from './repositories/call-session-repository.js';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import { DrizzleSchedulingSessionContextResolver } from './repositories/scheduling-session-context-resolver.js';
import { agentVersions } from './schema/agents.js';
import { outboundCampaigns } from './schema/outbound.js';
import { schedulingCalendars } from './schema/scheduling-calendars.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  createPublishedAgent,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createSyntheticLead, createWeekdayCalendar } from './test-support/scheduling-fixtures.js';
import {
  advanceSession,
  createBoundCallSession,
} from './test-support/scheduling-session-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-session-context');

/**
 * E2 PR 1 (DEC-075) — contexto confiável sessão → tentativa → tenant → lead →
 * agenda, com a prioridade D1 e a fixação por sessão, sobre PostgreSQL
 * descartável e repositórios reais. Nenhum efeito comercial.
 */
describe('E2 PR1: scheduling session context (D1, binding, pinning)', () => {
  const resolver = new DrizzleSchedulingSessionContextResolver(tdb.db);
  const sessions = new DrizzleCallSessionRepository(tdb.db);
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  /** Agente e versão publicados PRÓPRIOS do cenário (configuração isolada). */
  async function scenario(options: { scheduling?: unknown; tenant?: TenantFixture } = {}) {
    const base = options.tenant ?? fx.tenantA;
    const agent = await createPublishedAgent(tdb.db, base.organizationId, fx.userId);
    if (options.scheduling !== undefined) {
      await tdb.db
        .update(agentVersions)
        .set({ configuration: { prompt: 'synthetic', tools: [], scheduling: options.scheduling } })
        .where(eq(agentVersions.id, agent.agentVersionId));
    }
    const tenant: TenantFixture = { ...base, ...agent };
    const { lead, contact } = await createSyntheticLead(tdb.db, base.organizationId);
    return { tenant, lead, phone: contact.phoneE164 };
  }

  const query = (tenant: TenantFixture, sessionId: string) => ({
    organizationId: tenant.organizationId,
    sessionId,
    agentId: tenant.agentId,
    agentVersionId: tenant.agentVersionId,
  });
  async function calendarOf(q: ReturnType<typeof query>) {
    const context = await resolver.resolve(q);
    if (context.kind !== 'BOUND') throw new Error(`expected BOUND, got ${context.reason}`);
    return context.calendar;
  }
  const calendar = async (organizationId = fx.tenantA.organizationId) =>
    (await createWeekdayCalendar(tdb.db, { organizationId })).id;
  const setCampaignCalendar = (campaignId: string, calendarId: string | null) =>
    tdb.db
      .update(outboundCampaigns)
      .set({ schedulingCalendarId: calendarId })
      .where(eq(outboundCampaigns.id, campaignId));
  const setDefault = (calendarId: string, value: boolean) =>
    tdb.db
      .update(schedulingCalendars)
      .set({ isOrganizationDefault: value })
      .where(eq(schedulingCalendars.id, calendarId));

  it('valid path: active session, bound attempt, lead of the dialed phone and the CAMPAIGN calendar', async () => {
    const s = await scenario({ scheduling: { calendarId: await calendar() } });
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
    });
    const campaignCalendar = await calendar();
    await setCampaignCalendar(session.campaignId!, campaignCalendar);
    const context = await resolver.resolve(query(s.tenant, session.sessionId));
    expect(context).toMatchObject({
      kind: 'BOUND',
      binding: {
        sessionId: session.sessionId,
        attemptId: session.attemptId,
        jobId: session.jobId,
        campaignId: session.campaignId,
      },
      optOut: { available: true },
      scheduling: {
        kind: 'AVAILABLE',
        leadId: s.lead.id,
        calendarId: campaignCalendar,
        calendarSource: 'CAMPAIGN',
      },
    });
  });

  it('falls back ONLY on absence: campaign → published version → explicit organization default → absent', async () => {
    const agentCalendar = await calendar();
    const withAgent = await scenario({ scheduling: { calendarId: agentCalendar } });
    const a = await createBoundCallSession(tdb.db, {
      tenant: withAgent.tenant,
      destinationPhone: withAgent.phone,
    });
    expect(await calendarOf(query(withAgent.tenant, a.sessionId))).toEqual({
      kind: 'RESOLVED',
      calendarId: agentCalendar,
      source: 'AGENT_VERSION',
    });
    // Sem campanha e com snapshot ANTIGO (sem bloco de agenda): sem padrão = ausente, opt-out preservado.
    const old = await scenario({ tenant: fx.tenantB });
    const b = await createBoundCallSession(tdb.db, {
      tenant: old.tenant,
      destinationPhone: old.phone,
      withCampaign: false,
    });
    const absent = await resolver.resolve(query(old.tenant, b.sessionId));
    expect(absent).toMatchObject({
      kind: 'BOUND',
      calendar: { kind: 'ABSENT' },
      optOut: { available: true },
      scheduling: { kind: 'UNAVAILABLE', reason: 'CALENDAR_ABSENT' },
    });
    const fallbackDefault = await calendar(fx.tenantB.organizationId);
    await setDefault(fallbackDefault, true);
    const c = await createBoundCallSession(tdb.db, {
      tenant: old.tenant,
      destinationPhone: old.phone,
      withCampaign: false,
    });
    expect(await calendarOf(query(old.tenant, c.sessionId))).toEqual({
      kind: 'RESOLVED',
      calendarId: fallbackDefault,
      source: 'ORGANIZATION_DEFAULT',
    });
  });

  it('an invalid explicit configuration BLOCKS without silent fallback (opt-out still available)', async () => {
    const orgDefault = await calendar();
    await setDefault(orgDefault, true);
    const foreign = await calendar(fx.tenantB.organizationId);
    for (const [scheduling, reason] of [
      [{ calendarId: randomUUID() }, 'CALENDAR_NOT_FOUND'],
      [{ calendarId: foreign }, 'CALENDAR_NOT_FOUND'],
      [{ calendarId: 'not-a-uuid' }, 'AGENT_CONFIGURATION_INVALID'],
    ] as const) {
      const s = await scenario({ scheduling });
      const session = await createBoundCallSession(tdb.db, {
        tenant: s.tenant,
        destinationPhone: s.phone,
      });
      expect(await resolver.resolve(query(s.tenant, session.sessionId))).toMatchObject({
        kind: 'BOUND',
        optOut: { available: true },
        calendar: { kind: 'BLOCKED', source: 'AGENT_VERSION', reason },
        scheduling: { kind: 'UNAVAILABLE', reason: 'CALENDAR_BLOCKED' },
      });
    }
    await setDefault(orgDefault, false);
    // A agenda da campanha de OUTRO tenant é recusada pelo próprio banco (FK composta).
    const s = await scenario();
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
    });
    const failure = await setCampaignCalendar(session.campaignId!, foreign).then(
      () => null,
      (error: unknown) => classifyPostgresFailure(error),
    );
    expect(failure?.constraint).toBe('outbound_campaigns_scheduling_calendar_org_fk');
  });

  it('pins calendar, source and published version for the whole session', async () => {
    const first = await calendar();
    const s = await scenario({ scheduling: { calendarId: first } });
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
    });
    expect(await calendarOf(query(s.tenant, session.sessionId))).toMatchObject({
      calendarId: first,
      source: 'AGENT_VERSION',
    });
    // Durante a sessão: campanha passa a ter agenda e a versão é republicada com outra agenda.
    await setCampaignCalendar(session.campaignId!, await calendar());
    await tdb.db
      .update(agentVersions)
      .set({ status: 'ARCHIVED' })
      .where(eq(agentVersions.id, s.tenant.agentVersionId));
    const [v2] = await tdb.db
      .insert(agentVersions)
      .values({
        agentId: s.tenant.agentId,
        organizationId: s.tenant.organizationId,
        versionNumber: 2,
        status: 'PUBLISHED',
        configurationSchemaVersion: 1,
        configuration: {
          prompt: 'synthetic',
          tools: [],
          scheduling: { calendarId: await calendar() },
        },
        createdBy: fx.userId,
        publishedAt: new Date(),
        publishedBy: fx.userId,
      })
      .returning();
    expect(await calendarOf(query(s.tenant, session.sessionId))).toMatchObject({
      calendarId: first,
      source: 'AGENT_VERSION',
    });
    expect(
      await resolver.resolve({ ...query(s.tenant, session.sessionId), agentVersionId: v2!.id }),
    ).toEqual({
      kind: 'REFUSED',
      reason: 'AGENT_VERSION_MISMATCH',
    });
  });

  it('a pinned calendar that disappears BLOCKS instead of switching source', async () => {
    const s = await scenario({ tenant: fx.tenantB });
    const pinned = await calendar(fx.tenantB.organizationId);
    await tdb.db
      .update(schedulingCalendars)
      .set({ isOrganizationDefault: false })
      .where(eq(schedulingCalendars.organizationId, fx.tenantB.organizationId));
    await setDefault(pinned, true);
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
      withCampaign: false,
    });
    expect(await calendarOf(query(s.tenant, session.sessionId))).toMatchObject({
      calendarId: pinned,
    });
    await tdb.db
      .delete(schedulingCalendars)
      .where(
        and(
          eq(schedulingCalendars.id, pinned),
          eq(schedulingCalendars.organizationId, fx.tenantB.organizationId),
        ),
      );
    await setDefault(await calendar(fx.tenantB.organizationId), true);
    expect(await calendarOf(query(s.tenant, session.sessionId))).toEqual({
      kind: 'BLOCKED',
      source: 'ORGANIZATION_DEFAULT',
      reason: 'CALENDAR_NOT_FOUND',
    });
  });

  it('ended, ending or not yet active sessions keep the binding for opt-out but never allow scheduling', async () => {
    const s = await scenario({ scheduling: { calendarId: await calendar() } });
    for (const state of ['CREATED', 'CONNECTING', 'ENDING', 'ENDED', 'FAILED'] as const) {
      const session = await createBoundCallSession(tdb.db, {
        tenant: s.tenant,
        destinationPhone: s.phone,
        state,
      });
      expect(await resolver.resolve(query(s.tenant, session.sessionId))).toMatchObject({
        kind: 'BOUND',
        optOut: { available: true },
        scheduling: { kind: 'UNAVAILABLE', reason: 'SESSION_NOT_ACTIVE' },
      });
    }
    const live = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
    });
    await advanceSession(
      sessions,
      { organizationId: s.tenant.organizationId, sessionId: live.sessionId },
      'ENDED',
    );
    expect((await resolver.resolve(query(s.tenant, live.sessionId))).kind === 'BOUND').toBe(true);
  });

  it('refuses unknown sessions, other tenants, other agents and sessions without a bound attempt', async () => {
    const s = await scenario({ scheduling: { calendarId: await calendar() } });
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
    });
    const q = query(s.tenant, session.sessionId);
    expect(await resolver.resolve({ ...q, sessionId: randomUUID() })).toEqual({
      kind: 'REFUSED',
      reason: 'SESSION_NOT_FOUND',
    });
    expect(await resolver.resolve({ ...q, organizationId: fx.tenantB.organizationId })).toEqual({
      kind: 'REFUSED',
      reason: 'SESSION_NOT_FOUND',
    });
    expect(await resolver.resolve({ ...q, agentId: randomUUID() })).toEqual({
      kind: 'REFUSED',
      reason: 'AGENT_MISMATCH',
    });
    // Sessão que aponta para a tentativa sem a tentativa apontar de volta (vínculo de um lado só).
    const oneSided = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: s.phone,
      bindAttempt: false,
    });
    expect(await resolver.resolve(query(s.tenant, oneSided.sessionId))).toEqual({
      kind: 'REFUSED',
      reason: 'ATTEMPT_NOT_BOUND',
    });
  });

  it('no lead for the dialed phone: no scheduling, opt-out kept', async () => {
    const s = await scenario({ scheduling: { calendarId: await calendar() } });
    const session = await createBoundCallSession(tdb.db, {
      tenant: s.tenant,
      destinationPhone: '+5511900000999',
    });
    expect(await resolver.resolve(query(s.tenant, session.sessionId))).toMatchObject({
      kind: 'BOUND',
      optOut: { available: true },
      scheduling: { kind: 'UNAVAILABLE', reason: 'NO_LEAD_FOR_DESTINATION' },
    });
  });
});
