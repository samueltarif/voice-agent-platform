import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  OutboundBudgetPort,
  OutboundBudgetReservation,
  OutboundBudgetReservationStatus,
} from '@voice-agent/contracts';
import type { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DurableGuardedOriginationRunner } from './repositories/durable-guarded-origination-runner.js';
import type { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';

const scope = { organizationId: randomUUID(), attemptId: randomUUID() };
const jobId = randomUUID();
const idempotencyKey = 'guarded-status-key';

function buildReservation(status: OutboundBudgetReservationStatus): OutboundBudgetReservation {
  const now = new Date();
  return {
    id: randomUUID(),
    organizationId: scope.organizationId,
    attemptId: scope.attemptId,
    jobId,
    campaignId: null,
    reservedAmountMinorUnits: 500,
    reservedCarrierMinorUnits: 300,
    reservedConversationalMinorUnits: 200,
    settledCarrierMinorUnits: status === 'COMMITTED' ? 300 : 0,
    settledConversationalMinorUnits: status === 'COMMITTED' ? 200 : 0,
    settledAmountMinorUnits: status === 'COMMITTED' ? 500 : 0,
    status,
    idempotencyKey,
    releaseReason: status === 'RELEASED' ? 'ORIGINATION_ABORTED' : null,
    reservedAt: now,
    settledAt: status === 'COMMITTED' ? now : null,
    releasedAt: status === 'RELEASED' ? now : null,
  };
}

interface Harness {
  readonly runner: DurableGuardedOriginationRunner;
  readonly originationCalls: () => number;
  readonly releaseCalls: () => number;
}

function buildHarness(reservation: OutboundBudgetReservation): Harness {
  let originationCalls = 0;
  let releaseCalls = 0;

  const runner = {
    originate: async () => {
      originationCalls += 1;
      return { kind: 'NOT_SENT', reason: 'STUB_ORIGINATION' } as const;
    },
  } as unknown as DurableOutboundOriginationRunner;

  const attempts = {
    getById: async () => ({ attempt: { jobId, idempotencyKey } }),
  } as unknown as DrizzleCallAttemptRepository;

  const budget = {
    reserveBudget: async () => ({ kind: 'ALREADY_RESERVED', reservation }),
    releaseBudget: async () => {
      releaseCalls += 1;
      return { kind: 'ALREADY_RELEASED', reservation };
    },
  } as unknown as OutboundBudgetPort;

  return {
    runner: new DurableGuardedOriginationRunner({ runner, attempts, budget }),
    originationCalls: () => originationCalls,
    releaseCalls: () => releaseCalls,
  };
}

const estimatedCost = { estimatedCarrierMinorUnits: 300, estimatedConversationalMinorUnits: 200 };

describe('DurableGuardedOriginationRunner reservation status gate', () => {
  it.each(['RELEASED', 'COMMITTED'] as const)(
    'blocks origination when the persisted reservation is %s',
    async (status) => {
      const harness = buildHarness(buildReservation(status));

      const result = await harness.runner.originate(scope, estimatedCost);

      expect(result).toEqual({
        kind: 'NOT_SENT',
        reason: `BUDGET_BLOCKED:RESERVATION_NOT_PENDING:${status}`,
      });
      expect(harness.originationCalls()).toBe(0);
      expect(harness.releaseCalls()).toBe(0);
    },
  );

  it('allows idempotent origination when the persisted reservation is still pending', async () => {
    const harness = buildHarness(buildReservation('RESERVED'));

    const result = await harness.runner.originate(scope, estimatedCost);

    expect(result).toEqual({ kind: 'NOT_SENT', reason: 'STUB_ORIGINATION' });
    expect(harness.originationCalls()).toBe(1);
  });
});
