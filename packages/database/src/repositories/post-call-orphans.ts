import { sql } from 'drizzle-orm';
import type { EffectsDeps } from './post-call-effects.js';
import { ORPHAN_E2_SESSION } from './post-call-destination.js';
import { ensureReconciliation } from './post-call-reconciliation-store.js';
import { leadIdForPhone } from './scheduling-agent-opt-out.js';

/**
 * Auditoria #184 A5 — "transferência" da ocupação do destino: sessão
 * encerrada de agente da E2 sem linha de reconciliação (a composição não a
 * abriu) recebe a linha com a data do encerramento da tentativa, para seguir
 * o mesmo prazo de relatório ausente e a mesma revisão humana. Idempotente.
 */
export async function adoptOrphanSessions(deps: EffectsDeps, cutoff: Date): Promise<number> {
  const result = await deps.db.execute(sql`
    SELECT a.organization_id AS "organizationId", a.id AS "attemptId",
           a.call_session_id AS "sessionId", a.updated_at AS "closedAt",
           j.destination_phone AS "phoneE164"
    FROM call_attempts a
    JOIN outbound_call_jobs j ON j.id = a.job_id AND j.organization_id = a.organization_id
    WHERE ${ORPHAN_E2_SESSION} AND a.updated_at < ${cutoff}`);
  const rows = result.rows as Array<{
    organizationId: string;
    attemptId: string;
    sessionId: string;
    closedAt: Date | string;
    phoneE164: string;
  }>;
  for (const row of rows) {
    const { organizationId, phoneE164 } = row;
    const leadId = await leadIdForPhone(deps.db, { organizationId, phoneE164 });
    await deps.db.transaction((tx) =>
      ensureReconciliation(tx, row, { phoneE164, leadId, now: new Date(row.closedAt) }),
    );
  }
  return rows.length;
}
