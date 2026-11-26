import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  SchedulingSessionContext,
} from '@voice-agent/contracts';
import { CallLifecycleGateway } from './call-lifecycle-gateway.js';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import { GRANT_FIXTURE_IDS } from './published-tool-grant-fixtures.js';
import { resolveSchedulingContextForGrant } from './scheduling-session-authority.js';

const ORG = '22222222-2222-4222-8222-222222222222';
const X = '55555555-5555-4555-8555-555555555555';
const Y = '66666666-6666-4666-8666-666666666666';

function snapshot(calendarId?: string): AgentConfigurationSnapshotV1 {
  return {
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
    ...(calendarId ? { scheduling: { calendarId } } : {}),
  };
}

/** Caminho legítimo com um ponto para mutar o snapshot ENTRE preparo e consumo. */
async function issue(snap: AgentConfigurationSnapshotV1, beforeConsume?: () => void) {
  const gateway = new CallLifecycleGateway({
    bootstrapRegistry: new InMemoryCallBootstrapRegistry(),
    sessionStore: new InMemoryCallSessionStore(),
  });
  const bootstrap = await gateway.prepareCall({
    organizationId: ORG,
    ...GRANT_FIXTURE_IDS,
    agentSnapshot: snap,
    agentVersionStatus: 'PUBLISHED',
  });
  beforeConsume?.();
  const { toolGrant } = await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);
  if (!toolGrant) throw new Error('legitimate flow must issue a grant');
  return toolGrant;
}

const fromVersion = (calendarId: string) => ({
  resolve: async (): Promise<SchedulingSessionContext> => ({
    kind: 'BOUND',
    binding: {} as never,
    optOut: { available: true },
    scheduling: { kind: 'UNAVAILABLE', reason: 'SESSION_NOT_ACTIVE' },
    calendar: { kind: 'RESOLVED', calendarId, source: 'AGENT_VERSION' },
  }),
});

describe('E2 PR1 audit M2 — the grant keeps the calendar captured at trusted preparation', () => {
  it('mutating calendarId after preparation does not change the authority', async () => {
    const snap = snapshot(X);
    const grant = await issue(snap, () => {
      (snap.scheduling as { calendarId: string }).calendarId = Y;
    });
    expect(grant.schedulingCalendarId).toBe(X);
    expect((await resolveSchedulingContextForGrant(grant, fromVersion(Y))).kind).toBe('REFUSED');
    expect((await resolveSchedulingContextForGrant(grant, fromVersion(X))).kind).toBe('BOUND');
  });

  it('mutating or replacing the scheduling object after emission does not change it either', async () => {
    const snap = snapshot(X);
    const grant = await issue(snap);
    (snap.scheduling as { calendarId: string }).calendarId = Y;
    expect((await resolveSchedulingContextForGrant(grant, fromVersion(Y))).kind).toBe('REFUSED');
    (snap as { scheduling?: { calendarId: string } }).scheduling = { calendarId: Y };
    expect((await resolveSchedulingContextForGrant(grant, fromVersion(Y))).kind).toBe('REFUSED');
    expect(Object.isFrozen(grant) && grant.schedulingCalendarId).toBe(X);
  });

  it('a calendar inserted into an originally calendar-less snapshot gives no authority', async () => {
    const snap = snapshot();
    const grant = await issue(snap, () => {
      (snap as { scheduling?: { calendarId: string } }).scheduling = { calendarId: Y };
    });
    expect(grant.schedulingCalendarId).toBeNull();
    expect((await resolveSchedulingContextForGrant(grant, fromVersion(Y))).kind).toBe('REFUSED');
  });
});
