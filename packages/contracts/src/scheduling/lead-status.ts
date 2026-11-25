import { z } from 'zod';

/**
 * E1 (DEC-074) — estados comerciais do lead. O lead é sempre ligado a um
 * contato existente (nome e telefone ficam em `contacts`, sem duplicação).
 */
export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'MEETING_SCHEDULED',
  'NOT_INTERESTED',
  'DO_NOT_CALL',
] as const;
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

/** Quem originou a mudança: usuário no painel, agente de voz (futuro) ou o sistema. */
export const SCHEDULING_ACTOR_TYPES = ['USER', 'AGENT', 'SYSTEM'] as const;
export type SchedulingActorType = (typeof SCHEDULING_ACTOR_TYPES)[number];

/**
 * Origem da mudança. `MEETING_SCHEDULED` só é alcançado por reserva de reunião
 * e só é deixado por cancelamento (o painel não pode "fingir" uma reunião).
 */
export const LEAD_STATUS_CHANGE_ORIGINS = [
  'CREATED',
  'MANUAL',
  'MEETING_BOOKED',
  'MEETING_CANCELED',
] as const;
export type LeadStatusChangeOrigin = (typeof LEAD_STATUS_CHANGE_ORIGINS)[number];

export type LeadStatusChangeBlockReason =
  'SAME_STATUS' | 'LEAD_DO_NOT_CALL' | 'STATUS_MANAGED_BY_SCHEDULING' | 'TRANSITION_NOT_ALLOWED';

export type LeadStatusChangeVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason: LeadStatusChangeBlockReason };

const OPEN_STATUSES: ReadonlySet<LeadStatus> = new Set([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NOT_INTERESTED',
]);
const MANUAL_TARGETS: ReadonlySet<LeadStatus> = new Set([
  'CONTACTED',
  'QUALIFIED',
  'NOT_INTERESTED',
  'DO_NOT_CALL',
]);

export interface LeadStatusChangeRequest {
  readonly from: LeadStatus;
  readonly to: LeadStatus;
  readonly origin: Exclude<LeadStatusChangeOrigin, 'CREATED'>;
}

const block = (reason: LeadStatusChangeBlockReason): LeadStatusChangeVerdict => ({
  ok: false,
  reason,
});

function evaluateManual(from: LeadStatus, to: LeadStatus): LeadStatusChangeVerdict {
  if (from === 'MEETING_SCHEDULED' || to === 'MEETING_SCHEDULED') {
    return block('STATUS_MANAGED_BY_SCHEDULING');
  }
  if (!OPEN_STATUSES.has(from) || !MANUAL_TARGETS.has(to)) {
    return block('TRANSITION_NOT_ALLOWED');
  }
  return { ok: true };
}

/**
 * Regra determinística e única das transições do lead:
 * - `DO_NOT_CALL` é terminal (a supressão não tem remoção nesta fase);
 * - reunião marcada: só reserva leva a `MEETING_SCHEDULED`;
 * - cancelamento devolve `MEETING_SCHEDULED` → `QUALIFIED`;
 * - com reunião ativa, mudanças manuais exigem cancelar a reunião antes.
 */
export function evaluateLeadStatusChange(
  request: LeadStatusChangeRequest,
): LeadStatusChangeVerdict {
  const { from, to, origin } = request;
  if (from === 'DO_NOT_CALL') return block('LEAD_DO_NOT_CALL');
  if (from === to) return block('SAME_STATUS');
  if (origin === 'MANUAL') return evaluateManual(from, to);
  const allowed =
    origin === 'MEETING_BOOKED'
      ? to === 'MEETING_SCHEDULED' && OPEN_STATUSES.has(from)
      : from === 'MEETING_SCHEDULED' && to === 'QUALIFIED';
  return allowed ? { ok: true } : block('TRANSITION_NOT_ALLOWED');
}

/** Status inicial de um lead: um telefone já suprimido nasce `DO_NOT_CALL`. */
export function initialLeadStatus(phoneSuppressed: boolean): LeadStatus {
  return phoneSuppressed ? 'DO_NOT_CALL' : 'NEW';
}
