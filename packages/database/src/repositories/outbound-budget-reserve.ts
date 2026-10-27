import { and, eq, or } from 'drizzle-orm';
import type {
  ReserveOutboundBudgetInput,
  ReserveOutboundBudgetOutcome,
} from '@voice-agent/contracts';
import { evaluateBudgetReservation, type BudgetEvaluationDecision } from '@voice-agent/contracts';
import { outboundBudgetLedgers } from '../schema/outbound-budget-ledgers.js';
import { outboundBudgetReservations } from '../schema/outbound-budget-reservations.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  mapOutboundBudgetLedger,
  mapOutboundBudgetReservation,
} from './outbound-budget-mapping.js';
import {
  countActiveConcurrentReservations,
  countTodayCallAttempts,
} from './outbound-budget-queries.js';

async function findExistingReservation(
  tx: DatabaseExecutor,
  input: ReserveOutboundBudgetInput,
): Promise<ReserveOutboundBudgetOutcome | null> {
  const [existing] = await tx
    .select()
    .from(outboundBudgetReservations)
    .where(
      and(
        eq(outboundBudgetReservations.organizationId, input.organizationId),
        or(
          eq(outboundBudgetReservations.attemptId, input.attemptId),
          eq(outboundBudgetReservations.idempotencyKey, input.idempotencyKey),
        ),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      kind: 'ALREADY_RESERVED',
      reservation: mapOutboundBudgetReservation(existing),
    };
  }
  return null;
}

function mapDecisionToBlockOutcome(
  decision: Exclude<BudgetEvaluationDecision, { allowed: true }>,
): ReserveOutboundBudgetOutcome {
  if (decision.reason === 'CONCURRENCY_LIMIT_REACHED') {
    return {
      kind: 'CONCURRENCY_LIMIT_REACHED',
      activeConcurrentCalls: decision.activeConcurrentCalls,
      maxConcurrentCalls: decision.maxConcurrentCalls,
      reason: 'Active concurrent call limit reached for organization.',
    };
  }
  if (decision.reason === 'DAILY_QUOTA_EXCEEDED') {
    return {
      kind: 'DAILY_QUOTA_EXCEEDED',
      todayAttemptsCount: decision.todayAttemptsCount,
      maxDailyAttempts: decision.maxDailyAttempts,
      reason: 'Daily attempt quota exceeded for organization.',
    };
  }
  return {
    kind: 'INSUFFICIENT_FUNDS',
    availableMinorUnits: decision.availableMinorUnits,
    requestedMinorUnits: decision.requestedMinorUnits,
    reason: 'Insufficient available budget for reservation.',
  };
}

async function insertReservationRecord(
  tx: DatabaseExecutor,
  input: ReserveOutboundBudgetInput,
  now: Date,
) {
  const [created] = await tx
    .insert(outboundBudgetReservations)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      jobId: input.jobId,
      reservedAmountMinorUnits: input.estimatedAmountMinorUnits,
      reservedCarrierMinorUnits: input.estimatedCarrierMinorUnits ?? 0,
      reservedConversationalMinorUnits: input.estimatedConversationalMinorUnits ?? 0,
      settledCarrierMinorUnits: 0,
      settledConversationalMinorUnits: 0,
      settledAmountMinorUnits: 0,
      status: 'RESERVED',
      idempotencyKey: input.idempotencyKey,
      reservedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create outbound budget reservation');
  }
  return created;
}

export async function reserveBudgetInTransaction(
  tx: DatabaseExecutor,
  input: ReserveOutboundBudgetInput,
): Promise<ReserveOutboundBudgetOutcome> {
  const existingOutcome = await findExistingReservation(tx, input);
  if (existingOutcome) return existingOutcome;

  const [ledger] = await tx
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, input.organizationId))
    .for('update');

  if (!ledger) {
    return {
      kind: 'INSUFFICIENT_FUNDS',
      availableMinorUnits: 0,
      requestedMinorUnits: input.estimatedAmountMinorUnits,
      reason: 'LEDGER_NOT_FOUND',
    };
  }

  const activeConcurrentCalls = await countActiveConcurrentReservations(tx, input.organizationId);
  const todayAttemptsCount = await countTodayCallAttempts(tx, input.organizationId);

  const decision = evaluateBudgetReservation({
    ledger: mapOutboundBudgetLedger(ledger),
    requestedAmountMinorUnits: input.estimatedAmountMinorUnits,
    activeConcurrentCalls,
    todayAttemptsCount,
  });

  if (!decision.allowed) {
    return mapDecisionToBlockOutcome(decision);
  }

  const now = new Date();
  await tx
    .update(outboundBudgetLedgers)
    .set({
      reservedAmountMinorUnits: ledger.reservedAmountMinorUnits + input.estimatedAmountMinorUnits,
      version: ledger.version + 1,
      updatedAt: now,
    })
    .where(eq(outboundBudgetLedgers.id, ledger.id));

  const created = await insertReservationRecord(tx, input, now);

  return {
    kind: 'RESERVED',
    reservation: mapOutboundBudgetReservation(created),
    remainingAvailableMinorUnits: decision.availableMinorUnits - input.estimatedAmountMinorUnits,
  };
}
