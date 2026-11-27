import type { CallAttemptEntity } from '../schema/call-attempts.js';
import type { ClaimRejectionReason } from './call-attempt-claims.js';
import type { DatabaseExecutor } from './database-executor.js';
import { destinationOccupancy } from './post-call-destination.js';
import { applyCampaignSendRefusal, campaignSendRefusal } from './send-time-campaign-gate.js';
import {
  cancelSuppressedAttempt,
  isAttemptDestinationSuppressed,
} from './send-time-suppression-guard.js';

/** Barreiras do envio (campanha, supressão, reconciliação, ocupação do destino), na transação do claim. */
export async function sendTimeRefusal(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
  now: Date,
): Promise<ClaimRejectionReason | null> {
  const refusal = await campaignSendRefusal(executor, row);
  if (refusal) {
    await applyCampaignSendRefusal(executor, row, { refusal, now });
    return refusal;
  }
  if (await isAttemptDestinationSuppressed(executor, row)) {
    await cancelSuppressedAttempt(executor, row, now);
    return 'DESTINATION_SUPPRESSED';
  }
  // DEC-077: nada é cancelado — a tentativa volta a ser elegível quando a reconciliação fechar.
  // Reauditoria A5: reconciliação aberta, tentativa em curso e órfã num ÚNICO retrato (sob P).
  return destinationOccupancy(executor, row);
}
