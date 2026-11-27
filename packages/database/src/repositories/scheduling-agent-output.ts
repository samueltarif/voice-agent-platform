import {
  SCHEDULING_SPEECH,
  type AgentOutput,
  type OutputDecision,
  type SchedulingAgentScope,
} from '@voice-agent/contracts';
import type { SchedulingProtocolStateEntity } from '../schema/scheduling-protocol-states.js';
import { sessionIsActive, verifiedBooking } from './scheduling-agent-booking-verify.js';
import type { SchedulingEventDeps } from './scheduling-agent-events.js';
import { readProtocolRow, resolveAgentScope } from './scheduling-agent-scope.js';
import type { SchedulingBinding } from './scheduling-protocol-store.js';

/**
 * Auditoria consolidada da E2 (A1/A3/A6) — AUTORIDADE DA SAÍDA do agente.
 * Toda fala é autorizada no momento da emissão, pelo estado atual:
 * - sessão inativa: nada;
 * - opt-out registrado: só a confirmação do opt-out;
 * - possível opt-out pendente: só a pergunta e o esclarecimento;
 * - perguntas transacionais (lista, releitura, confirmação, reserva): só o
 *   servidor fala; texto livre do modelo apenas em `IDLE`;
 * - anúncio de reserva: só com a reunião conferida AGORA (agendada, mesma
 *   oferta, tentativa e lead) e com o texto do servidor — uma fase `BOOKED`
 *   histórica não basta.
 * Texto livre do modelo nunca é prova de veracidade; o filtro lexical é só
 * defesa adicional.
 */

type Row = SchedulingProtocolStateEntity | null;
const allow = (speech: string | null = null): OutputDecision => ({ allowed: true, speech });
const deny = (reason: string): OutputDecision => ({ allowed: false, reason });

const isOptedOut = (row: Row) => Boolean(row?.optOutRecordedAt) || row?.state.phase === 'OPTED_OUT';

type State = NonNullable<Row>['state'] | undefined;
type PhaseRule = (state: State, output: AgentOutput) => string | null;
const phaseOf = (state: State) => state?.phase ?? 'IDLE';
const isReading = (state: State) =>
  phaseOf(state) === 'READBACK_PENDING' || phaseOf(state) === 'READBACK_SPEAKING';

/** Saídas permitidas pela fase do protocolo (sem opt-out envolvido). */
const PHASE_RULES: Partial<Record<AgentOutput['kind'], PhaseRule>> = {
  MODEL_TEXT: (state) => (phaseOf(state) === 'IDLE' ? null : 'TRANSACTIONAL_PHASE'),
  PRESENTATION: (state, output) =>
    phaseOf(state) === 'PRESENTING' &&
    output.kind === 'PRESENTATION' &&
    state?.list?.revision === output.listRevision
      ? null
      : 'NOT_CURRENT_LIST',
  READBACK: (state, output) =>
    isReading(state) && output.kind === 'READBACK' && state?.selection?.offerId === output.offerId
      ? null
      : 'NOT_CURRENT_READBACK',
  CLARIFICATION: () => null,
  NOTICE: () => null,
};

function byPhase(row: Row, output: AgentOutput): OutputDecision {
  const rule = PHASE_RULES[output.kind];
  const refusal = rule ? rule(row?.state, output) : 'NOT_APPLICABLE';
  return refusal ? deny(refusal) : allow();
}

function whenOptedOut(output: AgentOutput): OutputDecision {
  return output.kind === 'OPT_OUT_CONFIRMATION'
    ? allow(SCHEDULING_SPEECH.OPT_OUT_RECORDED)
    : deny('OPT_OUT_REQUESTED');
}

function whenPending(output: AgentOutput): OutputDecision {
  const clarifying = output.kind === 'OPT_OUT_QUESTION' || output.kind === 'CLARIFICATION';
  return clarifying
    ? allow(SCHEDULING_SPEECH.OPT_OUT_CLARIFICATION)
    : deny('OPT_OUT_CLARIFICATION_PENDING');
}

function byOptOut(row: Row, output: AgentOutput): OutputDecision | null {
  if (isOptedOut(row)) return whenOptedOut(output);
  if (row?.optOutPending) return whenPending(output);
  if (output.kind === 'OPT_OUT_CONFIRMATION') return deny('NO_OPT_OUT_RECORDED');
  return output.kind === 'OPT_OUT_QUESTION' ? deny('NO_OPT_OUT_PENDING') : null;
}

function bookedState(row: Row) {
  const state = row?.state;
  return state?.phase === 'BOOKED' && state.meetingId ? state : null;
}

async function bookingResult(
  db: SchedulingEventDeps['db'],
  input: { binding: SchedulingBinding; row: Row; leadId: string | null },
): Promise<OutputDecision> {
  const state = bookedState(input.row);
  if (!state || !input.leadId) return deny('NO_VERIFIED_MEETING');
  const verified = await verifiedBooking(db, {
    binding: input.binding,
    leadId: input.leadId,
    offerId: state.authorization?.offerId ?? '',
    recovered: true,
  });
  return verified?.status === 'BOOKED' ? allow(verified.speech) : deny('NO_VERIFIED_MEETING');
}

export async function authorizeOutput(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  output: AgentOutput,
): Promise<OutputDecision> {
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return deny('CONTEXT_REFUSED');
  if (!(await sessionIsActive(deps.db, resolved.binding))) return deny('SESSION_NOT_ACTIVE');
  const row = await readProtocolRow(deps.db, resolved.binding);
  const optOut = byOptOut(row, output);
  if (optOut) return optOut;
  if (output.kind !== 'BOOKING_RESULT') return byPhase(row, output);
  const leadId = resolved.scheduling?.leadId ?? null;
  const { binding } = resolved;
  return bookingResult(deps.db, { binding, row, leadId });
}
