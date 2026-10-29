import { sql } from 'drizzle-orm';
import { NON_DISPATCHABLE_CAMPAIGN_STATUSES, type ClaimJobInput } from '@voice-agent/contracts';

export const OUTBOUND_JOB_RETURNING_COLUMNS = sql`
  id,
  organization_id AS "organizationId",
  campaign_id AS "campaignId",
  agent_id AS "agentId",
  agent_version_id AS "agentVersionId",
  destination_phone AS "destinationPhone",
  recipient_name AS "recipientName",
  status,
  scheduled_at AS "scheduledAt",
  claimed_at AS "claimedAt",
  claimed_by AS "claimedBy",
  attempts,
  max_attempts AS "maxAttempts",
  last_attempt_at AS "lastAttemptAt",
  next_retry_at AS "nextRetryAt",
  last_error AS "lastError",
  idempotency_key AS "idempotencyKey",
  call_id AS "callId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

/**
 * 008-MVP2: job de campanha PAUSED/CANCELED/COMPLETED nunca é reivindicado.
 * Avaliado na MESMA instrução do UPDATE (sem janela entre checagem e claim).
 * Jobs sem campanha e campanhas DRAFT (fluxo em lote da 007F) seguem elegíveis.
 */
const CAMPAIGN_DISPATCHABLE = sql`NOT EXISTS (
  SELECT 1 FROM outbound_campaigns c
  WHERE c.id = outbound_call_jobs.campaign_id
    AND c.organization_id = outbound_call_jobs.organization_id
    AND c.status IN (${sql.join(
      NON_DISPATCHABLE_CAMPAIGN_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    )})
)`;

export function buildClaimNextDueJobSql(organizationId: string, workerId: string, now: Date) {
  return sql`
    UPDATE outbound_call_jobs
    SET status = 'CLAIMED',
        claimed_at = ${now},
        claimed_by = ${workerId},
        attempts = attempts + 1,
        updated_at = ${now}
    WHERE id = (
      SELECT id FROM outbound_call_jobs
      WHERE organization_id = ${organizationId}
        AND (
          (status = 'SCHEDULED' AND scheduled_at <= ${now})
          OR (status = 'FAILED_RETRYABLE' AND next_retry_at <= ${now})
        )
        AND attempts < max_attempts
        AND ${CAMPAIGN_DISPATCHABLE}
      ORDER BY scheduled_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING ${OUTBOUND_JOB_RETURNING_COLUMNS};
  `;
}

export function buildClaimJobSql(input: ClaimJobInput, now: Date) {
  return sql`
    UPDATE outbound_call_jobs
    SET status = 'CLAIMED',
        claimed_at = ${now},
        claimed_by = ${input.workerId},
        attempts = attempts + 1,
        updated_at = ${now}
    WHERE id = ${input.jobId}
      AND organization_id = ${input.organizationId}
      AND (
        (status = 'SCHEDULED' AND scheduled_at <= ${now})
        OR (status = 'FAILED_RETRYABLE' AND next_retry_at <= ${now})
      )
      AND attempts < max_attempts
      AND ${CAMPAIGN_DISPATCHABLE}
    RETURNING ${OUTBOUND_JOB_RETURNING_COLUMNS};
  `;
}
