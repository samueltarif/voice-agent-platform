import type { ReserveOutboundBudgetInput } from '@voice-agent/contracts';
import { outboundBudgetReservations } from '../schema/outbound-budget-reservations.js';
import type { DatabaseExecutor } from './database-executor.js';

export async function insertReservationRecord(
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
      reservedCarrierMinorUnits: input.estimatedCarrierMinorUnits,
      reservedConversationalMinorUnits: input.estimatedConversationalMinorUnits,
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
