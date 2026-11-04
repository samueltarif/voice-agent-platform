import { describe, it, expect } from 'vitest';
import type { CallLeg } from './call-leg.js';
import { isCallLegStateAdvance } from './call-leg.js';
import { callLegEventSchema, type CallLegStatusEvent } from './call-leg-events.js';
import { classifySecondProviderReference } from './classify-second-provider-reference.js';
import { evaluateCallLegStatusEvent, type CallLegEventInput } from './evaluate-call-leg-event.js';
import { evaluateProviderReferenceBinding } from './evaluate-provider-reference-binding.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const CONTACT = 'contact-ref-1';
const AI = 'ai-ref-1';

function event(overrides: Partial<CallLegStatusEvent> = {}): CallLegStatusEvent {
  return {
    type: 'CALL_LEG_STATUS',
    organizationId: ORG,
    attemptId: ATTEMPT,
    occurredAt: '2026-11-04T12:00:00.000Z',
    sequence: 1,
    role: 'CONTACT_LEG',
    providerLegReference: CONTACT,
    parentLegReference: null,
    state: 'RINGING',
    ...overrides,
  };
}

function leg(overrides: Partial<CallLeg> = {}): CallLeg {
  return {
    organizationId: ORG,
    attemptId: ATTEMPT,
    role: 'CONTACT_LEG',
    providerLegReference: CONTACT,
    parentLegReference: null,
    state: 'RINGING',
    lastSequence: 1,
    ...overrides,
  };
}

function input(overrides: Partial<CallLegEventInput> = {}): CallLegEventInput {
  return {
    organizationId: ORG,
    attemptId: ATTEMPT,
    contactLegReference: CONTACT,
    transferRecorded: false,
    legs: [],
    event: event(),
    ...overrides,
  };
}

describe('provider reference binding (compare-and-set, pure rule)', () => {
  it('binds once; the same reference is idempotent (callback before or after the sync response)', () => {
    expect(
      evaluateProviderReferenceBinding({
        attemptState: 'ORIGINATION_SENT',
        currentReference: null,
        incomingReference: CONTACT,
      }),
    ).toEqual({ kind: 'BIND' });
    expect(
      evaluateProviderReferenceBinding({
        attemptState: 'ORIGINATION_ACCEPTED',
        currentReference: CONTACT,
        incomingReference: CONTACT,
      }),
    ).toEqual({ kind: 'ALREADY_BOUND' });
  });

  it('resolves OUTCOME_UNKNOWN / RECONCILIATION_PENDING by binding (proof of origination, no redial)', () => {
    for (const attemptState of ['OUTCOME_UNKNOWN', 'RECONCILIATION_PENDING'] as const) {
      expect(
        evaluateProviderReferenceBinding({
          attemptState,
          currentReference: null,
          incomingReference: CONTACT,
        }),
      ).toEqual({ kind: 'BIND' });
    }
  });

  it('flags a divergent reference as an anomaly and never binds outside origination states', () => {
    expect(
      evaluateProviderReferenceBinding({
        attemptState: 'ORIGINATION_ACCEPTED',
        currentReference: CONTACT,
        incomingReference: 'other',
      }),
    ).toEqual({ kind: 'DIVERGENT_REFERENCE_ANOMALY' });
    for (const attemptState of [
      'CREATED',
      'ORIGINATION_PENDING',
      'CANCELED',
      'CLOSED',
      'NOT_ORIGINATED',
      'ORIGINATION_REJECTED',
    ] as const) {
      expect(
        evaluateProviderReferenceBinding({
          attemptState,
          currentReference: null,
          incomingReference: CONTACT,
        }),
      ).toEqual({ kind: 'NOT_BINDABLE_STATE' });
    }
  });
});

describe('call leg events', () => {
  it('validates normalized events strictly (unknown fields and bad codes rejected)', () => {
    expect(callLegEventSchema.safeParse(event()).success).toBe(true);
    expect(callLegEventSchema.safeParse({ ...event(), callSid: 'x' }).success).toBe(false);
    expect(callLegEventSchema.safeParse({ ...event(), organizationId: 'org' }).success).toBe(false);
    const result = {
      type: 'AI_AGENT_LEG_RESULT',
      organizationId: ORG,
      attemptId: ATTEMPT,
      occurredAt: '2026-11-04T12:00:00.000Z',
      sequence: null,
      providerLegReference: AI,
      bridgeStatus: 'FAILED',
    };
    expect(callLegEventSchema.safeParse({ ...result, transportResponseCode: 503 }).success).toBe(
      true,
    );
    expect(callLegEventSchema.safeParse({ ...result, transportResponseCode: 99 }).success).toBe(
      false,
    );
  });

  it('applies new legs and advances state monotonically', () => {
    expect(evaluateCallLegStatusEvent(input())).toEqual({ kind: 'APPLY', leg: leg() });
    const answered = evaluateCallLegStatusEvent(
      input({ legs: [leg()], event: event({ state: 'ANSWERED', sequence: 2 }) }),
    );
    expect(answered).toEqual({ kind: 'APPLY', leg: leg({ state: 'ANSWERED', lastSequence: 2 }) });
    expect(isCallLegStateAdvance('COMPLETED', 'RINGING')).toBe(false);
  });

  it('ignores duplicates idempotently and never regresses on out-of-order events', () => {
    expect(evaluateCallLegStatusEvent(input({ legs: [leg()] }))).toEqual({ kind: 'DUPLICATE' });
    const done = leg({ state: 'COMPLETED', lastSequence: 4 });
    expect(
      evaluateCallLegStatusEvent(
        input({ legs: [done], event: event({ state: 'ANSWERED', sequence: 3 }) }),
      ),
    ).toEqual({ kind: 'STALE' });
    expect(
      evaluateCallLegStatusEvent(
        input({
          legs: [leg({ state: 'ANSWERED', lastSequence: 5 })],
          event: event({ state: 'COMPLETED', sequence: 2 }),
        }),
      ),
    ).toEqual({ kind: 'STALE' });
    expect(
      evaluateCallLegStatusEvent(
        input({ legs: [done], event: event({ state: 'FAILED', sequence: 9 }) }),
      ),
    ).toEqual({ kind: 'STALE' });
  });

  it('isolates tenants and attempts', () => {
    expect(
      evaluateCallLegStatusEvent(input({ event: event({ organizationId: OTHER_ORG }) })),
    ).toEqual({ kind: 'REJECTED', reason: 'TENANT_OR_ATTEMPT_MISMATCH' });
    expect(
      evaluateCallLegStatusEvent(
        input({ event: event({ attemptId: '33333333-3333-4333-8333-333333333333' }) }),
      ),
    ).toEqual({ kind: 'REJECTED', reason: 'TENANT_OR_ATTEMPT_MISMATCH' });
  });

  it('keeps HUMAN_AGENT_LEG reserved and requires the contact leg before any agent leg', () => {
    expect(
      evaluateCallLegStatusEvent(
        input({
          event: event({
            role: 'HUMAN_AGENT_LEG',
            providerLegReference: 'h',
            parentLegReference: CONTACT,
          }),
        }),
      ),
    ).toEqual({ kind: 'REJECTED', reason: 'HUMAN_AGENT_LEG_RESERVED' });
    const aiEvent = event({
      role: 'AI_AGENT_LEG',
      providerLegReference: AI,
      parentLegReference: CONTACT,
      state: 'INITIATED',
    });
    expect(
      evaluateCallLegStatusEvent(input({ contactLegReference: null, event: aiEvent })),
    ).toEqual({ kind: 'REJECTED', reason: 'CONTACT_LEG_UNKNOWN' });
    expect(
      evaluateCallLegStatusEvent(
        input({ event: { ...aiEvent, parentLegReference: 'someone-else' } }),
      ),
    ).toEqual({ kind: 'REJECTED', reason: 'PARENT_MISMATCH' });
    expect(evaluateCallLegStatusEvent(input({ event: aiEvent })).kind).toBe('APPLY');
  });

  it('allows a single active AI agent leg; a new one is accepted only after the previous ended', () => {
    const active = leg({
      role: 'AI_AGENT_LEG',
      providerLegReference: AI,
      parentLegReference: CONTACT,
      state: 'ANSWERED',
    });
    const second = event({
      role: 'AI_AGENT_LEG',
      providerLegReference: 'ai-ref-2',
      parentLegReference: CONTACT,
      state: 'INITIATED',
    });
    expect(evaluateCallLegStatusEvent(input({ legs: [leg(), active], event: second }))).toEqual({
      kind: 'REJECTED',
      reason: 'SECOND_ACTIVE_AI_AGENT_LEG',
    });
    expect(
      evaluateCallLegStatusEvent(
        input({ legs: [leg(), { ...active, state: 'COMPLETED' }], event: second }),
      ).kind,
    ).toBe('APPLY');
  });
});

describe('R-1: a second identifier never ends a call', () => {
  const base = {
    endpointRole: 'CONTACT_LEG' as const,
    incomingReference: 'contact-ref-2',
    boundContactReference: CONTACT,
    parentReference: null,
    transferRecorded: false,
    operatorConfirmation: null,
  };

  it('a second contact reference from events is only unverified (alert and review)', () => {
    expect(
      evaluateCallLegStatusEvent(
        input({ event: event({ providerLegReference: 'contact-ref-2' }) }),
      ),
    ).toEqual({
      kind: 'SECOND_CONTACT_REFERENCE',
      assessment: { classification: 'UNVERIFIED_SECOND_REFERENCE', action: 'ALERT_AND_REVIEW' },
    });
  });

  it('legitimate child legs and transfers are not anomalies', () => {
    expect(
      classifySecondProviderReference({
        ...base,
        endpointRole: 'AI_AGENT_LEG',
        parentReference: CONTACT,
      }),
    ).toEqual({ classification: 'LEGITIMATE_CHILD_LEG', action: 'NONE' });
    expect(classifySecondProviderReference({ ...base, transferRecorded: true })).toEqual({
      classification: 'TRANSFER_LEG',
      action: 'NONE',
    });
    expect(classifySecondProviderReference({ ...base, incomingReference: CONTACT })).toEqual({
      classification: 'SAME_REFERENCE',
      action: 'NONE',
    });
  });

  it('proven duplicate requires every criterion and still only alerts', () => {
    const all = { bothAreParentCalls: true, sameDestination: true, overlappingInTime: true };
    expect(classifySecondProviderReference({ ...base, operatorConfirmation: all })).toEqual({
      classification: 'PROVEN_DUPLICATE_ORIGINATION',
      action: 'ALERT_AND_REVIEW',
    });
    for (const key of Object.keys(all) as (keyof typeof all)[]) {
      expect(
        classifySecondProviderReference({ ...base, operatorConfirmation: { ...all, [key]: false } })
          .classification,
      ).toBe('UNVERIFIED_SECOND_REFERENCE');
    }
    expect(
      classifySecondProviderReference({
        ...base,
        endpointRole: 'AI_AGENT_LEG',
        operatorConfirmation: all,
      }).classification,
    ).toBe('UNVERIFIED_SECOND_REFERENCE');
  });
});
