import type { MeetingEntity } from '@voice-agent/database';

/**
 * E1 (auditoria B1) — DTO explícito da reunião, por permissão. Nunca saem
 * da API: chave de idempotência, impressão digital do pedido e o id interno
 * da oferta. Quem só lê ou opera (VIEWER, OPERATOR) recebe a visão básica;
 * identificadores de autoria, tentativa e o motivo livre de cancelamento
 * ficam restritos a quem gerencia a agenda (`scheduling.manage`).
 */
export type MeetingView = 'BASE' | 'MANAGE';

export function projectMeeting(meeting: MeetingEntity, view: MeetingView) {
  const base = {
    id: meeting.id,
    calendarId: meeting.calendarId,
    leadId: meeting.leadId,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    status: meeting.status,
    version: meeting.version,
    bookedByType: meeting.bookedByType,
    createdAt: meeting.createdAt,
    canceledAt: meeting.canceledAt,
  };
  if (view === 'BASE') return base;
  return {
    ...base,
    bookedById: meeting.bookedById,
    canceledByType: meeting.canceledByType,
    canceledById: meeting.canceledById,
    cancelReason: meeting.cancelReason,
    sourceAttemptId: meeting.sourceAttemptId,
  };
}
