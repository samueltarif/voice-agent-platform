import { describe, expect, it } from 'vitest';
import {
  evaluateOutboundSessionGate,
  type OutboundSessionGateInput,
} from './outbound-session-gate.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const open: OutboundSessionGateInput = {
  organizationId: ORG,
  killSwitchEngaged: false,
  agentVersion: { organizationId: ORG, status: 'PUBLISHED' },
  entitlementActive: true,
  campaignState: null,
  destinationSuppressed: false,
  budget: { allowed: true, availableMinorUnits: 100 },
};

describe('S4 — outbound session gate (pure, fail-closed)', () => {
  it('allows only when every control passes (standalone attempt without campaign)', () => {
    expect(evaluateOutboundSessionGate(open)).toEqual({ allowed: true });
  });

  it('kill switch wins over every other failing control', () => {
    const everythingWrong: OutboundSessionGateInput = {
      ...open,
      killSwitchEngaged: true,
      agentVersion: null,
      entitlementActive: false,
      campaignState: 'CANCELED',
      destinationSuppressed: true,
      budget: { allowed: false, reason: 'GLOBAL_LEDGER_NOT_FOUND' },
    };
    expect(evaluateOutboundSessionGate(everythingWrong)).toEqual({
      allowed: false,
      reason: 'KILL_SWITCH_ENGAGED',
    });
  });

  it.each([
    [{ agentVersion: null }, 'AGENT_VERSION_NOT_PUBLISHED'],
    [{ agentVersion: { organizationId: ORG, status: 'ARCHIVED' } }, 'AGENT_VERSION_NOT_PUBLISHED'],
    [{ campaignState: 'CANCELED' }, 'CAMPAIGN_NOT_ACTIVE'],
    [
      {
        budget: {
          allowed: false,
          reason: 'DAILY_QUOTA_EXCEEDED',
          todayAttemptsCount: 3,
          maxDailyAttempts: 3,
        },
      },
      'BUDGET_DENIED',
    ],
    [{ killSwitchEngaged: undefined }, 'KILL_SWITCH_ENGAGED'],
    [{ destinationSuppressed: undefined }, 'DESTINATION_SUPPRESSED'],
  ] as const)('%j → %s (missing or unexpected values never allow)', (overrides, reason) => {
    const input = { ...open, ...overrides } as unknown as OutboundSessionGateInput;
    expect(evaluateOutboundSessionGate(input)).toEqual({ allowed: false, reason });
  });
});
