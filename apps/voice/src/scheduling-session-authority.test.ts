import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  SchedulingSessionContext,
  SchedulingSessionContextQuery,
} from '@voice-agent/contracts';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';
import {
  resolveSchedulingContextForGrant,
  SCHEDULING_GRANT_REQUIRED_MESSAGE,
} from './scheduling-session-authority.js';

const ORG = '22222222-2222-4222-8222-222222222222';
const CAL = '55555555-5555-4555-8555-555555555555';
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

function recordingPort(answer: (q: SchedulingSessionContextQuery) => SchedulingSessionContext) {
  const queries: SchedulingSessionContextQuery[] = [];
  return {
    queries,
    port: {
      resolve: async (q: SchedulingSessionContextQuery) => {
        queries.push(q);
        return answer(q);
      },
    },
  };
}

const bound = (calendar: Extract<SchedulingSessionContext, { kind: 'BOUND' }>['calendar']) =>
  ({
    kind: 'BOUND',
    binding: {} as never,
    optOut: { available: true },
    scheduling: { kind: 'UNAVAILABLE', reason: 'SESSION_NOT_ACTIVE' },
    calendar,
  }) as SchedulingSessionContext;

describe('E2 PR1 — scheduling context only through a legitimate PublishedToolGrant', () => {
  it('fabricated, copied or JSON-rebuilt grants are refused before any lookup', async () => {
    const grant = await issueTestToolGrant({ organizationId: ORG, snapshot });
    const { port, queries } = recordingPort(() => bound({ kind: 'ABSENT' }));
    for (const fake of [
      { ...grant },
      JSON.parse(JSON.stringify(grant)),
      Object.freeze({ ...grant, tools: [...grant.tools] }),
      {
        organizationId: ORG,
        agentId: grant.agentId,
        agentVersionId: grant.agentVersionId,
        callId: grant.callId,
      },
      null,
    ]) {
      await expect(resolveSchedulingContextForGrant(fake, port)).rejects.toThrow(
        SCHEDULING_GRANT_REQUIRED_MESSAGE,
      );
    }
    expect(queries).toEqual([]);
  });

  it('a legitimate grant supplies tenant, session (= callId), agent and pinned version — nothing else', async () => {
    const grant = await issueTestToolGrant({ organizationId: ORG, snapshot });
    const { port, queries } = recordingPort(() => bound({ kind: 'ABSENT' }));
    expect(await resolveSchedulingContextForGrant(grant, port)).toMatchObject({ kind: 'BOUND' });
    expect(queries).toEqual([
      {
        organizationId: ORG,
        sessionId: grant.callId,
        agentId: grant.agentId,
        agentVersionId: grant.agentVersionId,
      },
    ]);
  });

  it('a calendar from the published version must match the snapshot frozen in the grant', async () => {
    const withCalendar = await issueTestToolGrant({
      organizationId: ORG,
      snapshot: { ...snapshot, scheduling: { calendarId: CAL } },
    });
    const agree = recordingPort(() =>
      bound({ kind: 'RESOLVED', calendarId: CAL, source: 'AGENT_VERSION' }),
    );
    expect((await resolveSchedulingContextForGrant(withCalendar, agree.port)).kind).toBe('BOUND');
    const old = await issueTestToolGrant({ organizationId: ORG, snapshot });
    const differ = recordingPort(() =>
      bound({ kind: 'RESOLVED', calendarId: CAL, source: 'AGENT_VERSION' }),
    );
    expect(await resolveSchedulingContextForGrant(old, differ.port)).toEqual({
      kind: 'REFUSED',
      reason: 'AGENT_VERSION_MISMATCH',
    });
    // Campanha ou padrão da empresa não dependem do snapshot.
    const campaign = recordingPort(() =>
      bound({ kind: 'RESOLVED', calendarId: CAL, source: 'CAMPAIGN' }),
    );
    expect((await resolveSchedulingContextForGrant(old, campaign.port)).kind).toBe('BOUND');
  });
});
