import type { LeadStatusChangeEntity } from '@voice-agent/database';
import type { MeetingView } from './meeting-projection.js';

/**
 * E1 (2ª auditoria, B1) — histórico do lead projetado pela MESMA regra do DTO
 * de reunião: VIEWER e OPERATOR veem o que mudou, quando, a origem e o tipo
 * de ator; o identificador do ator e o texto livre do motivo ficam restritos
 * a `scheduling.manage`. Ids internos da linha e do tenant nunca saem.
 */
export function projectStatusChange(change: LeadStatusChangeEntity, view: MeetingView) {
  const base = {
    fromStatus: change.fromStatus,
    toStatus: change.toStatus,
    origin: change.origin,
    actorType: change.actorType,
    meetingId: change.meetingId,
    createdAt: change.createdAt,
  };
  return view === 'MANAGE' ? { ...base, actorId: change.actorId, reason: change.reason } : base;
}

export function projectLeadView<T extends { readonly history: readonly LeadStatusChangeEntity[] }>(
  lead: T,
  view: MeetingView,
) {
  return { ...lead, history: lead.history.map((change) => projectStatusChange(change, view)) };
}
