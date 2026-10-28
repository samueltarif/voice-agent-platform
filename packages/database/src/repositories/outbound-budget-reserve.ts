import { and, eq, or } from 'drizzle-orm';
import type {
  ReserveOutboundBudgetInput,
  ReserveOutboundBudgetOutcome,
} from '@voice-agent/contracts';
import { evaluateBudgetReservation, getStartOfDayInTimezone } from '@voice-agent/contracts';
import {
  outboundBudgetLedgers,
  type OutboundBudgetLedgerEntity,
} from '../schema/outbound-budget-ledgers.js';
import { outboundBudgetReservations } from '../schema/outbound-budget-reservations.js';
import {
  platformGlobalBudgetLedgers,
  type PlatformGlobalBudgetLedgerEntity,
} from '../schema/platform-global-budget-ledger.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  mapOutboundBudgetLedger,
  mapOutboundBudgetReservation,
  mapPlatformGlobalBudgetLedger,
} from './outbound-budget-mapping.js';
import {
  countActiveConcurrentReservations,
  countGlobalActiveConcurrentReservations,
  countTodayCallAttempts,
  GLOBAL_BUDGET_LEDGER_ID,
} from './outbound-budget-queries.js';
import { mapDecisionToBlockOutcome } from './outbound-budget-reserve-mapper.js';
import { insertReservationRecord } from './outbound-budget-reserve-record.js';

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

interface EncumberParams {
  readonly globalRow: PlatformGlobalBudgetLedgerEntity;
  readonly tenantRow: OutboundBudgetLedgerEntity;
  readonly amount: number;
  readonly now: Date;
}

async function encumberLedgers(tx: DatabaseExecutor, params: EncumberParams): Promise<void> {
  await tx
    .update(platformGlobalBudgetLedgers)
    .set({
      reservedAmountMinorUnits: params.globalRow.reservedAmountMinorUnits + params.amount,
      version: params.globalRow.version + 1,
      updatedAt: params.now,
    })
    .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID));

  await tx
    .update(outboundBudgetLedgers)
    .set({
      reservedAmountMinorUnits: params.tenantRow.reservedAmountMinorUnits + params.amount,
      version: params.tenantRow.version + 1,
      updatedAt: params.now,
    })
    .where(eq(outboundBudgetLedgers.id, params.tenantRow.id));
}

async function lockLedgers(tx: DatabaseExecutor, organizationId: string) {
  const [globalRow] = await tx
    .select()
    .from(platformGlobalBudgetLedgers)
    .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID))
    .for('update');

  const [tenantRow] = await tx
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, organizationId))
    .for('update');

  return { globalRow, tenantRow };
}

export async function reserveBudgetInTransaction(
  tx: DatabaseExecutor,
  input: ReserveOutboundBudgetInput,
): Promise<ReserveOutboundBudgetOutcome> {
  const existingOutcome = await findExistingReservation(tx, input);
  if (existingOutcome) return existingOutcome;

  const { globalRow, tenantRow } = await lockLedgers(tx, input.organizationId);
  if (!globalRow) {
    return { kind: 'GLOBAL_LEDGER_NOT_FOUND', reason: 'Global budget ledger not found.' };
  }
  if (!tenantRow) {
    return {
      kind: 'INSUFFICIENT_FUNDS',
      availableMinorUnits: 0,
      requestedMinorUnits: input.estimatedAmountMinorUnits,
      reason: 'LEDGER_NOT_FOUND',
    };
  }

  const globalActive = await countGlobalActiveConcurrentReservations(tx);
  const activeConcurrent = await countActiveConcurrentReservations(tx, input.organizationId);
  const since = getStartOfDayInTimezone(new Date(), tenantRow.timezone ?? 'UTC');
  const todayAttempts = await countTodayCallAttempts(tx, input.organizationId, since);

  const decision = evaluateBudgetReservation({
    globalLedger: mapPlatformGlobalBudgetLedger(globalRow),
    globalActiveConcurrentCalls: globalActive,
    ledger: mapOutboundBudgetLedger(tenantRow),
    requestedAmountMinorUnits: input.estimatedAmountMinorUnits,
    activeConcurrentCalls: activeConcurrent,
    todayAttemptsCount: todayAttempts,
  });

  if (!decision.allowed) return mapDecisionToBlockOutcome(decision);

  const now = new Date();
  await encumberLedgers(tx, {
    globalRow,
    tenantRow,
    amount: input.estimatedAmountMinorUnits,
    now,
  });
  const created = await insertReservationRecord(tx, input, now);

  return {
    kind: 'RESERVED',
    reservation: mapOutboundBudgetReservation(created),
    remainingAvailableMinorUnits: decision.availableMinorUnits - input.estimatedAmountMinorUnits,
  };
}
