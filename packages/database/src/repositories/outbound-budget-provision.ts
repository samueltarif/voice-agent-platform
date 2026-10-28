import { eq } from 'drizzle-orm';
import type {
  OutboundBudgetLedger,
  PlatformGlobalBudgetLedger,
  ProvisionGlobalBudgetLedgerInput,
  ProvisionOutboundBudgetLedgerInput,
} from '@voice-agent/contracts';
import {
  outboundBudgetLedgers,
  type OutboundBudgetLedgerEntity,
} from '../schema/outbound-budget-ledgers.js';
import {
  platformGlobalBudgetLedgers,
  type PlatformGlobalBudgetLedgerEntity,
} from '../schema/platform-global-budget-ledger.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  mapOutboundBudgetLedger,
  mapPlatformGlobalBudgetLedger,
} from './outbound-budget-mapping.js';
import { GLOBAL_BUDGET_LEDGER_ID } from './outbound-budget-queries.js';

async function updateExistingLedger(
  tx: DatabaseExecutor,
  existing: OutboundBudgetLedgerEntity,
  input: ProvisionOutboundBudgetLedgerInput,
): Promise<OutboundBudgetLedger> {
  const [updated] = await tx
    .update(outboundBudgetLedgers)
    .set({
      allocatedBudgetMinorUnits: input.allocatedBudgetMinorUnits,
      currency: input.currency,
      maxConcurrentCalls: input.maxConcurrentCalls,
      maxDailyAttempts: input.maxDailyAttempts,
      timezone: input.timezone ?? existing.timezone ?? 'UTC',
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(outboundBudgetLedgers.organizationId, input.organizationId))
    .returning();

  if (!updated) {
    throw new Error('Failed to update outbound budget ledger');
  }
  return mapOutboundBudgetLedger(updated);
}

async function insertNewLedger(
  tx: DatabaseExecutor,
  input: ProvisionOutboundBudgetLedgerInput,
): Promise<OutboundBudgetLedger> {
  const now = new Date();
  const [created] = await tx
    .insert(outboundBudgetLedgers)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      currency: input.currency,
      allocatedBudgetMinorUnits: input.allocatedBudgetMinorUnits,
      reservedAmountMinorUnits: 0,
      spentCarrierMinorUnits: 0,
      spentConversationalMinorUnits: 0,
      spentAmountMinorUnits: 0,
      maxConcurrentCalls: input.maxConcurrentCalls,
      maxDailyAttempts: input.maxDailyAttempts,
      timezone: input.timezone ?? 'UTC',
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create outbound budget ledger');
  }
  return mapOutboundBudgetLedger(created);
}

export async function provisionLedgerInTransaction(
  tx: DatabaseExecutor,
  input: ProvisionOutboundBudgetLedgerInput,
): Promise<OutboundBudgetLedger> {
  const [existing] = await tx
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, input.organizationId))
    .for('update');

  if (existing) {
    return updateExistingLedger(tx, existing, input);
  }
  return insertNewLedger(tx, input);
}

async function updateExistingGlobalLedger(
  tx: DatabaseExecutor,
  existing: PlatformGlobalBudgetLedgerEntity,
  input: ProvisionGlobalBudgetLedgerInput,
): Promise<PlatformGlobalBudgetLedger> {
  const [updated] = await tx
    .update(platformGlobalBudgetLedgers)
    .set({
      allocatedBudgetMinorUnits: input.allocatedBudgetMinorUnits,
      currency: input.currency,
      maxConcurrentCalls: input.maxConcurrentCalls,
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID))
    .returning();

  if (!updated) {
    throw new Error('Failed to update platform global budget ledger');
  }
  return mapPlatformGlobalBudgetLedger(updated);
}

export async function provisionGlobalLedgerInTransaction(
  tx: DatabaseExecutor,
  input: ProvisionGlobalBudgetLedgerInput,
): Promise<PlatformGlobalBudgetLedger> {
  const [existing] = await tx
    .select()
    .from(platformGlobalBudgetLedgers)
    .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID))
    .for('update');

  if (existing) {
    return updateExistingGlobalLedger(tx, existing, input);
  }

  const now = new Date();
  const [created] = await tx
    .insert(platformGlobalBudgetLedgers)
    .values({
      id: GLOBAL_BUDGET_LEDGER_ID,
      currency: input.currency,
      allocatedBudgetMinorUnits: input.allocatedBudgetMinorUnits,
      reservedAmountMinorUnits: 0,
      spentCarrierMinorUnits: 0,
      spentConversationalMinorUnits: 0,
      spentAmountMinorUnits: 0,
      maxConcurrentCalls: input.maxConcurrentCalls,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create platform global budget ledger');
  }
  return mapPlatformGlobalBudgetLedger(created);
}
