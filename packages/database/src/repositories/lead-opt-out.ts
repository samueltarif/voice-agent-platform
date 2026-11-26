import type { LeadEntity } from '../schema/leads.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyLeadStatusChange, suppressLeadPhone } from './lead-status-writer.js';
import { insertSchedulingAudit, type SchedulingActor } from './scheduling-audit-entry.js';

export type LeadOptOutResult = {
  readonly kind: 'CHANGED' | 'OPTED_OUT_MEETING_PRESERVED' | 'ALREADY_DO_NOT_CALL';
  readonly lead: LeadEntity;
};

/**
 * E1 (auditoria A4) — pedido de não receber ligações, com o lead já travado.
 * A supressão canônica do telefone é registrada SEMPRE e em primeiro lugar,
 * qualquer que seja o status comercial. Só então o status é decidido:
 * - lead aberto → `DO_NOT_CALL` (histórico + auditoria);
 * - reunião ativa → reunião preservada até cancelamento explícito (o
 *   cancelamento devolve o lead a `DO_NOT_CALL`, pois o telefone segue suprimido);
 * - já `DO_NOT_CALL` → nada muda além de garantir a supressão.
 * A supressão nunca é removida implicitamente por nenhum fluxo do E1.
 */
export async function recordLeadOptOut(
  tx: DatabaseExecutor,
  input: {
    readonly lead: LeadEntity;
    readonly actor: SchedulingActor;
    readonly reason?: string | undefined;
  },
): Promise<LeadOptOutResult> {
  const { lead, actor } = input;
  await suppressLeadPhone(tx, lead, actor);
  if (lead.status === 'DO_NOT_CALL') return { kind: 'ALREADY_DO_NOT_CALL', lead };
  if (lead.status === 'MEETING_SCHEDULED') {
    await insertSchedulingAudit(tx, {
      organizationId: lead.organizationId,
      actor,
      action: 'lead.opted_out',
      targetType: 'lead',
      targetId: lead.id,
      metadata: { status: lead.status, meetingPreserved: 'yes' },
    });
    return { kind: 'OPTED_OUT_MEETING_PRESERVED', lead };
  }
  const changed = await applyLeadStatusChange(tx, {
    lead,
    to: 'DO_NOT_CALL',
    origin: 'OPT_OUT',
    actor,
    reason: input.reason,
  });
  if (changed.kind !== 'CHANGED') throw new Error(`Opt-out transition refused: ${changed.reason}`);
  return changed;
}
