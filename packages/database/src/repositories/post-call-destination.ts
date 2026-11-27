import { sql, type SQL } from 'drizzle-orm';
import {
  LEAD_RECORD_OPT_OUT_TOOL,
  LEAD_RECORD_OUTCOME_TOOL,
  SCHEDULING_TOOL_NAMES,
} from '@voice-agent/contracts';
import type { CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';

/**
 * Auditoria #184 A5 — ocupação do destino ANTES de existir reconciliação.
 * Na transação do claim de envio (depois da trava P do telefone, que
 * serializa os claims do mesmo destino):
 * - outra tentativa do mesmo tenant e telefone já ENVIADA e não terminada
 *   (`ORIGINATION_SENT`, `ORIGINATION_ACCEPTED`, `OUTCOME_UNKNOWN`,
 *   `RECONCILIATION_PENDING`) ocupa o destino quando uma das duas é de
 *   agente com ferramentas da E2 (escopo dos achados; o comportamento das
 *   campanhas legadas, sem reconciliação pós-chamada, não muda) — o `SEND_STARTED` da primeira
 *   é gravado na mesma transação do seu claim, então duas campanhas obtêm no
 *   máximo um `CLAIMED`; rejeição/não originação liberam o destino;
 * - tentativa ENCERRADA de agente com ferramentas da E2, com sessão e sem
 *   linha de reconciliação (composição não a abriu), também ocupa: o relatório
 *   ainda é esperado. `expireOverdue` adota essas sessões (prazo e revisão).
 */

const E2_TOOLS: SQL = sql.raw(
  `array[${[...SCHEDULING_TOOL_NAMES, LEAD_RECORD_OUTCOME_TOOL, LEAD_RECORD_OPT_OUT_TOOL]
    .map((name) => `'${name}'`)
    .join(',')}]`,
);

/** A versão de agente (id, tenant) publica ferramentas da E2? */
const e2Version = (versionId: SQL, organizationId: SQL): SQL => sql`EXISTS (
  SELECT 1 FROM agent_versions v
  WHERE v.id = ${versionId} AND v.organization_id = ${organizationId}
    AND jsonb_typeof(v.configuration -> 'tools') = 'array'
    AND (v.configuration -> 'tools') ?| ${E2_TOOLS})`;

/** A versão do agente da tentativa `a` publica ferramentas da E2? */
export const E2_AGENT_VERSION: SQL = e2Version(sql`a.agent_version_id`, sql`a.organization_id`);

/** Sessão encerrada de agente da E2 ainda sem reconciliação (tentativa `a`). */
export const ORPHAN_E2_SESSION: SQL = sql`(a.state = 'CLOSED' AND a.call_session_id IS NOT NULL
  AND ${E2_AGENT_VERSION}
  AND NOT EXISTS (SELECT 1 FROM post_call_reconciliations r
    WHERE r.organization_id = a.organization_id AND r.session_id = a.call_session_id))`;

export type DestinationOccupancy = 'DESTINATION_IN_FLIGHT' | 'POST_CALL_RECONCILIATION_PENDING';

export async function destinationOccupancy(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
): Promise<DestinationOccupancy | null> {
  const mine = e2Version(sql`${row.agentVersionId}::uuid`, sql`${row.organizationId}::uuid`);
  const result = await executor.execute(sql`
    SELECT a.state AS state
    FROM call_attempts a
    JOIN outbound_call_jobs j ON j.id = a.job_id AND j.organization_id = a.organization_id
    JOIN outbound_call_jobs mine ON mine.id = ${row.jobId} AND mine.organization_id = ${row.organizationId}
    WHERE a.organization_id = ${row.organizationId} AND a.id <> ${row.id}
      AND j.destination_phone = mine.destination_phone
      AND ((a.state IN ('ORIGINATION_SENT', 'ORIGINATION_ACCEPTED', 'OUTCOME_UNKNOWN', 'RECONCILIATION_PENDING')
          AND (${E2_AGENT_VERSION} OR ${mine}))
        OR ${ORPHAN_E2_SESSION})
    ORDER BY (a.state = 'CLOSED') ASC
    LIMIT 1`);
  const hit = result.rows[0] as { state: string } | undefined;
  if (!hit) return null;
  return hit.state === 'CLOSED' ? 'POST_CALL_RECONCILIATION_PENDING' : 'DESTINATION_IN_FLIGHT';
}
