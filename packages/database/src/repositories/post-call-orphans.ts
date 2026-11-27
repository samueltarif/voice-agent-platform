import { sql } from 'drizzle-orm';
import { postCallReconciliations } from '../schema/post-call-reconciliations.js';
import type { EffectsDeps } from './post-call-effects.js';
import { ORPHAN_E2_ATTEMPT } from './post-call-destination.js';
import { leadIdForPhone } from './scheduling-agent-opt-out.js';

/**
 * Auditoria #184 A5 — "transferência" da ocupação do destino: tentativa
 * encerrada de agente da E2 sem linha de reconciliação (a composição não a
 * abriu) recebe a linha com a data do encerramento:
 * - com sessão: `AWAITING_REPORT` (mesmo prazo de relatório ausente);
 * - SEM sessão vinculada (reauditoria): `NEEDS_REVIEW` (`SESSION_NOT_BOUND`),
 *   resolvível pela tentativa — o relatório não tem como ser reconciliado.
 * Idempotente (`ON CONFLICT DO NOTHING`). O claim já trata a órfã como
 * ocupação no mesmo retrato em que lê as reconciliações, então a adoção não
 * precisa da trava do telefone (e não a toma, para não inverter R → P).
 */
export async function adoptOrphanSessions(deps: EffectsDeps, cutoff: Date): Promise<number> {
  const result = await deps.db.execute(sql`
    SELECT a.organization_id AS "organizationId", a.id AS "attemptId",
           a.call_session_id AS "sessionId", a.updated_at AS "closedAt",
           j.destination_phone AS "phoneE164"
    FROM call_attempts a
    JOIN outbound_call_jobs j ON j.id = a.job_id AND j.organization_id = a.organization_id
    WHERE ${ORPHAN_E2_ATTEMPT} AND a.updated_at < ${cutoff}`);
  const rows = result.rows as Array<{
    organizationId: string;
    attemptId: string;
    sessionId: string | null;
    closedAt: Date | string;
    phoneE164: string;
  }>;
  for (const row of rows) {
    const { organizationId, attemptId, sessionId, phoneE164 } = row;
    const leadId = await leadIdForPhone(deps.db, { organizationId, phoneE164 });
    const closedAt = new Date(row.closedAt);
    const unbound = sessionId === null;
    await deps.db
      .insert(postCallReconciliations)
      .values({
        organizationId,
        attemptId,
        sessionId,
        leadId,
        phoneE164,
        status: unbound ? 'NEEDS_REVIEW' : 'AWAITING_REPORT',
        reviewReasons: unbound ? ['SESSION_NOT_BOUND'] : [],
        createdAt: closedAt,
        updatedAt: closedAt,
      })
      .onConflictDoNothing();
  }
  return rows.length;
}
