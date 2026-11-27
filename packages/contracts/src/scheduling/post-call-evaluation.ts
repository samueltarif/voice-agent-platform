import { classifyLeadReply, type LeadReplyIntent } from './lead-reply-intent.js';
import { mentionsOptOut } from './lead-reply-opt-out-mention.js';
import type { PostCallEntry, PostCallReport } from './post-call-report.js';
import { endsWithCanonicalReadback } from './post-call-readback.js';
import { SCHEDULING_REQUEST_BOOKING_TOOL } from './scheduling-agent-port.js';

/**
 * E2 simplificada (DEC-077) — avaliação PURA e CONSERVADORA do relatório
 * pós-chamada. Decide só com evidência do HISTÓRICO, nunca com a frase que o
 * modelo passou à ferramenta:
 * - interlocução: alguma fala do interlocutor não vazia (ferramenta chamada
 *   não prova interlocução);
 * - opt-out: alguma fala classificada como pedido (`OPT_OUT`) ou menção não
 *   resolvida (revisão);
 * - aceite do agendamento: histórico COMPLETO e em ordem; o ÚLTIMO pedido
 *   de reserva do histórico é o da MESMA lista e opção da intenção (A2); a
 *   última fala do interlocutor antes dele é um aceite inteiro (`AFFIRM`); a
 *   fala do agente imediatamente anterior termina com a pergunta CANÔNICA de
 *   confirmação da oferta (A1, `post-call-readback`); nada depois a contradiz.
 * - opt-out (reauditoria A3): pedido só de fala ÍNTEGRA; fala truncada que
 *   pede ou menciona opt-out vira menção (revisão), nunca supressão definitiva.
 * Qualquer outra situação vai para revisão humana — nunca para reserva.
 */

export interface PendingBookingIntent {
  readonly listRevision: number;
  readonly option: number;
  readonly startsAt: string;
  readonly timeZone: string;
}

export type BookingEvidence = 'ACCEPTED' | 'REJECTED' | 'REVIEW' | 'NONE';
export type OptOutEvidence = 'REQUESTED' | 'MENTIONED' | 'NONE';

export interface PostCallEvaluation {
  readonly interlocution: boolean;
  /** Histórico sem fala potencialmente perdida (A3). */
  readonly complete: boolean;
  readonly optOut: OptOutEvidence;
  readonly booking: { readonly decision: BookingEvidence; readonly reason: string };
}

type LeadEntry = Extract<PostCallEntry, { kind: 'LEAD' }>;
const isLead = (entry: PostCallEntry): entry is LeadEntry => entry.kind === 'LEAD';
const intentOf = (entry: LeadEntry): LeadReplyIntent => classifyLeadReply(entry.text);
const spoke = (entry: PostCallEntry) => isLead(entry) && intentOf(entry).kind !== 'SILENCE';

const asksOptOut = (entry: LeadEntry) => intentOf(entry).kind === 'OPT_OUT';

function optOutOf(entries: readonly PostCallEntry[]): OptOutEvidence {
  const leads = entries.filter(isLead);
  if (leads.some((entry) => !entry.truncated && asksOptOut(entry))) return 'REQUESTED';
  const mentioned = (entry: LeadEntry) => asksOptOut(entry) || mentionsOptOut(entry.text);
  return leads.some(mentioned) ? 'MENTIONED' : 'NONE';
}

const isBookingRequest = (entry: PostCallEntry) =>
  entry.kind === 'TOOL_CALL' && entry.toolName === SCHEDULING_REQUEST_BOOKING_TOOL;

function matchesIntent(entry: PostCallEntry, intent: PendingBookingIntent): boolean {
  if (entry.kind !== 'TOOL_CALL' || !isBookingRequest(entry)) return false;
  const args = entry.arguments as { listRevision?: unknown; option?: unknown } | null;
  return args?.listRevision === intent.listRevision && args?.option === intent.option;
}

function lastIndex<T>(items: readonly T[], test: (item: T) => boolean, before = items.length) {
  for (let i = before - 1; i >= 0; i -= 1) if (test(items[i]!)) return i;
  return -1;
}

const review = (reason: string) => ({ decision: 'REVIEW' as const, reason });

const CONTRADICTIONS = new Set(['NEGATE', 'OPT_OUT', 'AMBIGUOUS', 'TIME_CHANGE', 'SELECT']);

function contradictedAfter(entries: readonly PostCallEntry[], from: number): boolean {
  return entries
    .slice(from + 1)
    .some((entry) => isLead(entry) && CONTRADICTIONS.has(intentOf(entry).kind));
}

function judgeReply(
  entries: readonly PostCallEntry[],
  leadAt: number,
  intent: PendingBookingIntent,
): PostCallEvaluation['booking'] {
  const reply = intentOf(entries[leadAt] as LeadEntry);
  if (reply.kind === 'NEGATE' || reply.kind === 'OPT_OUT') {
    return { decision: 'REJECTED', reason: 'LEAD_DECLINED' };
  }
  if (reply.kind !== 'AFFIRM') return review('ACCEPTANCE_UNCLEAR');
  const agentAt = lastIndex(entries, (entry) => entry.kind === 'AGENT', leadAt);
  const readback = agentAt >= 0 ? (entries[agentAt] as { text: string }).text : '';
  if (!endsWithCanonicalReadback(readback, intent.startsAt, intent.timeZone)) {
    return review('READBACK_NOT_EVIDENT');
  }
  return { decision: 'ACCEPTED', reason: 'LEAD_AFFIRMED_READBACK' };
}

function bookingOf(
  report: PostCallReport,
  intent: PendingBookingIntent | null,
): PostCallEvaluation['booking'] {
  if (!intent) return { decision: 'NONE', reason: 'NO_PENDING_INTENT' };
  if (report.integrity !== 'COMPLETE') return review('HISTORY_INCOMPLETE');
  if (report.ordering !== 'TIMELINE') return review('ORDERING_UNKNOWN');
  const { entries } = report;
  const callAt = lastIndex(entries, (entry) => matchesIntent(entry, intent));
  if (callAt < 0) return review('TOOL_CALL_NOT_IN_REPORT');
  // A2: um pedido posterior (outra opção) torna a intenção sobrevivente duvidosa.
  if (lastIndex(entries, isBookingRequest) !== callAt) return review('LAST_REQUEST_MISMATCH');
  if (contradictedAfter(entries, callAt)) return review('LEAD_REPLY_AFTER_REQUEST');
  const leadAt = lastIndex(entries, spoke, callAt);
  if (leadAt < 0) return review('NO_LEAD_REPLY');
  return judgeReply(entries, leadAt, intent);
}

export function evaluatePostCallReport(
  report: PostCallReport,
  intent: PendingBookingIntent | null,
): PostCallEvaluation {
  const optOut = optOutOf(report.entries);
  const booking = !intent
    ? bookingOf(report, intent)
    : optOut === 'REQUESTED'
      ? { decision: 'REJECTED' as const, reason: 'OPT_OUT_REQUESTED' }
      : optOut === 'MENTIONED'
        ? review('OPT_OUT_MENTION_UNCLEAR')
        : bookingOf(report, intent);
  const complete = report.integrity === 'COMPLETE';
  return { interlocution: report.entries.some(spoke), complete, optOut, booking };
}
