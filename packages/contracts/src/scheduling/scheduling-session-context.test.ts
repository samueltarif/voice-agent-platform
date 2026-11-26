import { describe, expect, it } from 'vitest';
import { agentConfigurationSnapshotV1Schema } from '../agents/agent-configuration-v1.js';
import { schedulingCapabilityFor } from './scheduling-session-context.js';

const CAL = '11111111-1111-4111-8111-111111111111';
const resolved = { kind: 'RESOLVED' as const, calendarId: CAL, source: 'CAMPAIGN' as const };

describe('E2 PR1 — scheduling capability rule', () => {
  it('needs an ACTIVE session, a lead for the destination and a resolved calendar', () => {
    expect(
      schedulingCapabilityFor({ sessionActive: true, leadId: 'lead', calendar: resolved }),
    ).toEqual({
      kind: 'AVAILABLE',
      leadId: 'lead',
      calendarId: CAL,
      calendarSource: 'CAMPAIGN',
    });
    const reasons = [
      schedulingCapabilityFor({ sessionActive: false, leadId: 'lead', calendar: resolved }),
      schedulingCapabilityFor({
        sessionActive: true,
        leadId: 'lead',
        calendar: { kind: 'BLOCKED', source: 'AGENT_VERSION', reason: 'CALENDAR_NOT_FOUND' },
      }),
      schedulingCapabilityFor({
        sessionActive: true,
        leadId: 'lead',
        calendar: { kind: 'ABSENT' },
      }),
      schedulingCapabilityFor({ sessionActive: true, leadId: null, calendar: resolved }),
    ].map((capability) => capability.kind === 'UNAVAILABLE' && capability.reason);
    expect(reasons).toEqual([
      'SESSION_NOT_ACTIVE',
      'CALENDAR_BLOCKED',
      'CALENDAR_ABSENT',
      'NO_LEAD_FOR_DESTINATION',
    ]);
  });
});

describe('E2 PR1 — agent snapshot compatibility (D1)', () => {
  const base = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Exemplo',
      objective: 'Atender',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Até logo',
      fallbackPhrase: 'Pode repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: [], deterministic: {} },
  };

  it('old snapshots (without scheduling) stay valid and keep no calendar', () => {
    const parsed = agentConfigurationSnapshotV1Schema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty('scheduling');
  });

  it('accepts only a strict { calendarId: uuid } scheduling block', () => {
    const ok = agentConfigurationSnapshotV1Schema.safeParse({
      ...base,
      scheduling: { calendarId: CAL },
    });
    expect(ok.success && ok.data.scheduling).toEqual({ calendarId: CAL });
    for (const scheduling of [{ calendarId: 'x' }, { calendarId: CAL, extra: 1 }, {}]) {
      expect(agentConfigurationSnapshotV1Schema.safeParse({ ...base, scheduling }).success).toBe(
        false,
      );
    }
  });
});
