import { sql, type SQL } from 'drizzle-orm';
import {
  LEAD_RECORD_OPT_OUT_TOOL,
  LEAD_RECORD_OUTCOME_TOOL,
  SCHEDULING_TOOL_NAMES,
} from '@voice-agent/contracts';
import type { CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';

/**
 * Auditoria #184 A5 (reauditoria) — ocupação do destino decidida numa ÚNICA
 * consulta (um só retrato do banco), na transação do claim e sob a trava P do
 * telefone, que serializa os claims do mesmo destino:
 * - reconciliação aberta para o telefone ⇒ `POST_CALL_RECONCILIATION_PENDING`;
 * - outra tentativa já ENVIADA e não terminada, quando uma das duas é de
 *   agente com ferramentas da E2 ⇒ `DESTINATION_IN_FLIGHT` (o `SEND_STARTED`
 *   da primeira é gravado na transação do seu claim ⇒ no máximo um `CLAIMED`;
 *   rejeição/não originação liberam; desfecho incerto mantém);
 * - tentativa ENCERRADA de agente da E2 sem linha de reconciliação — com ou
 *   SEM sessão vinculada — ⇒ `POST_CALL_RECONCILIATION_PENDING`.
 * Como reconciliação aberta e "órfã" são lidas no mesmo retrato, a criação
 * concorrente da linha (adoção, relatório, ferramenta) nunca abre uma janela:
 * ou o retrato tem a linha (pendente) ou não tem (órfã). `expireOverdue`
 * adota as órfãs (prazo; sem sessão ⇒ revisão `SESSION_NOT_BOUND`).
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

/** Tentativa `a` encerrada, de agente da E2, sem linha de reconciliação (com ou sem sessão). */
export const ORPHAN_E2_ATTEMPT: SQL = sql`(a.state = 'CLOSED' AND ${E2_AGENT_VERSION}
  AND NOT EXISTS (SELECT 1 FROM post_call_reconciliations r
    WHERE r.organization_id = a.organization_id
      AND (r.attempt_id = a.id OR (a.call_session_id IS NOT NULL AND r.session_id = a.call_session_id))))`;

export type DestinationOccupancy = 'DESTINATION_IN_FLIGHT' | 'POST_CALL_RECONCILIATION_PENDING';

export async function destinationOccupancy(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
): Promise<DestinationOccupancy | null> {
  const mine = e2Version(sql`${row.agentVersionId}::uuid`, sql`${row.organizationId}::uuid`);
  const result = await executor.execute(sql`
    WITH dest AS (
      SELECT destination_phone AS phone FROM outbound_call_jobs
      WHERE id = ${row.jobId} AND organization_id = ${row.organizationId})
    SELECT reason FROM (
      SELECT 'POST_CALL_RECONCILIATION_PENDING' AS reason, 1 AS prio
      FROM post_call_reconciliations r, dest
      WHERE r.organization_id = ${row.organizationId} AND r.phone_e164 = dest.phone
        AND r.status <> 'RECONCILED'
      UNION ALL
      SELECT CASE WHEN a.state = 'CLOSED' THEN 'POST_CALL_RECONCILIATION_PENDING'
                  ELSE 'DESTINATION_IN_FLIGHT' END, 2
      FROM call_attempts a
      JOIN outbound_call_jobs j ON j.id = a.job_id AND j.organization_id = a.organization_id
      JOIN dest ON j.destination_phone = dest.phone
      WHERE a.organization_id = ${row.organizationId} AND a.id <> ${row.id}
        AND ((a.state IN ('ORIGINATION_SENT', 'ORIGINATION_ACCEPTED', 'OUTCOME_UNKNOWN', 'RECONCILIATION_PENDING')
            AND (${E2_AGENT_VERSION} OR ${mine}))
          OR ${ORPHAN_E2_ATTEMPT})
    ) found ORDER BY prio LIMIT 1`);
  const hit = result.rows[0] as { reason: DestinationOccupancy } | undefined;
  return hit?.reason ?? null;
}
