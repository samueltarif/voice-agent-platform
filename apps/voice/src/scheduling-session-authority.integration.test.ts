import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { DrizzleSchedulingSessionContextResolver } from '@voice-agent/database';
import {
  createBoundCallSession,
  createDisposableTestDatabase,
  createDurableOutboundFixture,
  createSyntheticLead,
  createWeekdayCalendar,
  setCampaignSchedulingCalendar,
  type DurableOutboundFixture,
} from '@voice-agent/database/test-support';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';
import { resolveSchedulingContextForGrant } from './scheduling-session-authority.js';

const tdb = await createDisposableTestDatabase('e2-grant-context');

const snapshot: AgentConfigurationSnapshotV1 = {
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Exemplo',
    objective: 'Agendar',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Até logo',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: [], deterministic: {} },
};

/**
 * E2 PR 1 — da concessão emitida pelo gateway ao contexto confiável no banco
 * descartável: `callId` da concessão = `call_sessions.id` do vínculo durável.
 */
describe('E2 PR1: grant → durable session → scheduling context (integration)', () => {
  let fx: DurableOutboundFixture;
  const resolver = new DrizzleSchedulingSessionContextResolver(tdb.db);

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  it('resolves the trusted context only for the session bound to the grant', async () => {
    const tenant = fx.tenantA;
    const grant = await issueTestToolGrant({
      organizationId: tenant.organizationId,
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
      snapshot,
    });
    const { lead, contact } = await createSyntheticLead(tdb.db, tenant.organizationId);
    const session = await createBoundCallSession(tdb.db, {
      tenant,
      destinationPhone: contact.phoneE164,
      sessionId: grant.callId,
    });
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: tenant.organizationId });
    await setCampaignSchedulingCalendar(tdb.db, {
      organizationId: tenant.organizationId,
      campaignId: session.campaignId!,
      calendarId: calendar.id,
    });
    expect(await resolveSchedulingContextForGrant(grant, resolver)).toMatchObject({
      kind: 'BOUND',
      binding: { sessionId: grant.callId, attemptId: session.attemptId },
      scheduling: {
        kind: 'AVAILABLE',
        leadId: lead.id,
        calendarId: calendar.id,
        calendarSource: 'CAMPAIGN',
      },
    });
    // Concessão legítima de OUTRA chamada (sem sessão durável): recusada.
    const otherCall = await issueTestToolGrant({
      organizationId: tenant.organizationId,
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
      snapshot,
    });
    expect(await resolveSchedulingContextForGrant(otherCall, resolver)).toEqual({
      kind: 'REFUSED',
      reason: 'SESSION_NOT_FOUND',
    });
  });
});
