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
 * `OPT_OUT` é o pedido de não receber ligações: a supressão canônica do
 * telefone é SEMPRE registrada; esta regra decide só o status comercial.
 */
export const LEAD_STATUS_CHANGE_ORIGINS = [
  'CREATED',
  'MANUAL',
  'OPT_OUT',
  'MEETING_BOOKED',
  'MEETING_CANCELED',
  // E2 PR 3 (DEC-075, D5): resultado comercial registrado pelo agente numa chamada.
  'CALL_OUTCOME',
] as const;
export type LeadStatusChangeOrigin = (typeof LEAD_STATUS_CHANGE_ORIGINS)[number];

export type LeadStatusChangeBlockReason =
  | 'SAME_STATUS'
  | 'LEAD_DO_NOT_CALL'
  | 'STATUS_MANAGED_BY_SCHEDULING'
  | 'TRANSITION_NOT_ALLOWED'
  | 'ACTIVE_MEETING_PRESERVED';

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
]);

export interface LeadStatusChangeRequest {
  readonly from: LeadStatus;
  readonly to: LeadStatus;
  readonly origin: Exclude<LeadStatusChangeOrigin, 'CREATED'>;
}

const OK: LeadStatusChangeVerdict = { ok: true };
const block = (reason: LeadStatusChangeBlockReason): LeadStatusChangeVerdict => ({
  ok: false,
  reason,
});

function evaluateManual(from: LeadStatus, to: LeadStatus): LeadStatusChangeVerdict {
  if (from === 'DO_NOT_CALL') return block('LEAD_DO_NOT_CALL');
  if (from === 'MEETING_SCHEDULED' || to === 'MEETING_SCHEDULED') {
    return block('STATUS_MANAGED_BY_SCHEDULING');
  }
  // `DO_NOT_CALL` manual é tratado como OPT_OUT pelo repositório.
  return MANUAL_TARGETS.has(to) ? OK : block('TRANSITION_NOT_ALLOWED');
}

function evaluateOptOut(from: LeadStatus, to: LeadStatus): LeadStatusChangeVerdict {
  if (to !== 'DO_NOT_CALL') return block('TRANSITION_NOT_ALLOWED');
  // Reunião já marcada é preservada até cancelamento explícito.
  return from === 'MEETING_SCHEDULED' ? block('ACTIVE_MEETING_PRESERVED') : OK;
}

/**
 * Reserva: de status aberto ou de `DO_NOT_CALL` (reunião pedida pelo próprio
 * cliente, registrada por um usuário; a supressão NÃO é removida). O agente
 * (prospecção ativa) é barrado antes, pela supressão canônica do telefone.
 */
function evaluateBooking(from: LeadStatus, to: LeadStatus): LeadStatusChangeVerdict {
  const allowed = to === 'MEETING_SCHEDULED' && (OPEN_STATUSES.has(from) || from === 'DO_NOT_CALL');
  return allowed ? OK : block('TRANSITION_NOT_ALLOWED');
}

function evaluateCancellation(from: LeadStatus, to: LeadStatus): LeadStatusChangeVerdict {
  const allowed = from === 'MEETING_SCHEDULED' && (to === 'QUALIFIED' || to === 'DO_NOT_CALL');
  return allowed ? OK : block('TRANSITION_NOT_ALLOWED');
}

/**
 * D5 — resultado do agente: só avança entre status ABERTOS e nunca sai de
 * `DO_NOT_CALL` nem entra/sai de `MEETING_SCHEDULED` (reserva e cancelamento
 * são os únicos caminhos) nem leva a `DO_NOT_CALL` (só o opt-out). `CONTACTED`
 * só a partir de `NEW` (não rebaixa uma qualificação). Sem resposta ou falha
 * técnica não são resultados do agente (nunca viram `NOT_INTERESTED`).
 */
function evaluateCallOutcome(from: LeadStatus, to: LeadStatus): LeadStatusChangeVerdict {
  if (from === 'DO_NOT_CALL') return block('LEAD_DO_NOT_CALL');
  if (from === 'MEETING_SCHEDULED') return block('ACTIVE_MEETING_PRESERVED');
  if (to === 'CONTACTED') return from === 'NEW' ? OK : block('TRANSITION_NOT_ALLOWED');
  return to === 'QUALIFIED' || to === 'NOT_INTERESTED' ? OK : block('TRANSITION_NOT_ALLOWED');
}

const EVALUATORS = {
  MANUAL: evaluateManual,
  OPT_OUT: evaluateOptOut,
  MEETING_BOOKED: evaluateBooking,
  MEETING_CANCELED: evaluateCancellation,
  CALL_OUTCOME: evaluateCallOutcome,
} as const;

/**
 * Regra determinística e única das transições do lead:
 * - mudança manual não sai de `DO_NOT_CALL` nem entra ou sai de `MEETING_SCHEDULED`;
 * - opt-out leva a `DO_NOT_CALL`, exceto com reunião ativa (preservada);
 * - cancelamento devolve a `QUALIFIED`, ou a `DO_NOT_CALL` se o telefone estiver suprimido.
 */
export function evaluateLeadStatusChange(
  request: LeadStatusChangeRequest,
): LeadStatusChangeVerdict {
  const { from, to, origin } = request;
  if (from === to) return block('SAME_STATUS');
  return EVALUATORS[origin](from, to);
}

/** Status do lead depois do cancelamento: a supressão do telefone prevalece. */
export function leadStatusAfterCancellation(phoneSuppressed: boolean): LeadStatus {
  return phoneSuppressed ? 'DO_NOT_CALL' : 'QUALIFIED';
}

/** Status inicial de um lead: um telefone já suprimido nasce `DO_NOT_CALL`. */
export function initialLeadStatus(phoneSuppressed: boolean): LeadStatus {
  return phoneSuppressed ? 'DO_NOT_CALL' : 'NEW';
}
