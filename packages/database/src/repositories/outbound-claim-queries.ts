import { sql } from 'drizzle-orm';
import type { ClaimJobInput } from '@voice-agent/contracts';

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
    RETURNING ${OUTBOUND_JOB_RETURNING_COLUMNS};
  `;
}
