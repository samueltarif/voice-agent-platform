import { eq } from 'drizzle-orm';
import type {
  OutboundBudgetLedger,
  ProvisionOutboundBudgetLedgerInput,
} from '@voice-agent/contracts';
import {
  outboundBudgetLedgers,
  type OutboundBudgetLedgerEntity,
} from '../schema/outbound-budget-ledgers.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapOutboundBudgetLedger } from './outbound-budget-mapping.js';

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
