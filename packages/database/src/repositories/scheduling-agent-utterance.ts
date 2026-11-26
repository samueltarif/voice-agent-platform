import type {
  BookingProtocolStep,
  LeadTurn,
  SchedulingAgentScope,
  SchedulingProtocolView,
} from '@voice-agent/contracts';
import { decideUtterance } from './scheduling-agent-clarification.js';
import {
  assertTransportId,
  withLockedProtocol,
  type LockedEvent,
  type SchedulingEventDeps,
} from './scheduling-agent-events.js';
import { recordCanonicalOptOut, type OptOutSource } from './scheduling-agent-opt-out.js';
import { protocolView } from './scheduling-agent-view.js';
import { applyProtocolEvent, reserveSeq } from './scheduling-protocol-store.js';

/**
 * E2 PR 3 (DEC-075, D2) + auditoria consolidada — fala FINAL do interlocutor,
 * classificada no servidor e VINCULADA ao turno do transporte que a iniciou
 * (A1): final de outro turno, repetida ou sem início é ignorada sem efeito.
 * Opt-out reconhecido é gravado na supressão canônica NA MESMA transação.
 * Com possível opt-out pendente, a única saída é o esclarecimento (A3).
 */

type Utterance = LeadTurn & { readonly text: string };

/** Pendente: só o esclarecimento. "Não" claro em `IDLE`: pedido de nova lista. */
function guidedStep(
  step: BookingProtocolStep,
  flags: { readonly pending: boolean; readonly resumed: boolean },
): BookingProtocolStep {
  if (flags.pending) return { state: step.state, directives: [{ kind: 'ASK_CLARIFICATION' }] };
  if (!flags.resumed || step.state.phase !== 'IDLE' || step.directives.length > 0) return step;
  return { state: step.state, directives: [{ kind: 'REQUEST_NEW_LIST' }] };
}

/** Opt-out reconhecido pelo protocolo NESTA fala: supressão canônica na mesma transação. */
async function maybeRecordOptOut(
  event: LockedEvent,
  input: {
    readonly applied: Awaited<ReturnType<typeof applyProtocolEvent>>;
    readonly source: OptOutSource | null;
  },
) {
  const { applied, source } = input;
  const optedOut = applied.step.directives.some((directive) => directive.kind === 'RECORD_OPT_OUT');
  if (!optedOut || !source) return null;
  return recordCanonicalOptOut(event.tx, applied.locked, {
    lead: event.lead,
    organizationId: event.binding.organizationId,
    sessionId: event.binding.sessionId,
    phoneE164: event.phoneE164,
    actor: { type: 'AGENT', id: event.binding.agentId },
    source,
    now: event.now,
  });
}

/** Turno da fala final: o pendente, repetido ou outro. */
function turnRefusal(event: LockedEvent, turnId: string): string | null {
  const row = event.locked.row;
  if (row.lastFinalTurnId === turnId) return 'DUPLICATE_FINAL';
  if (row.leadSpeechStartedSeq === null) return 'UTTERANCE_WITHOUT_START';
  return row.leadTurnId === turnId ? null : 'TURN_MISMATCH';
}

function ignoredView(event: LockedEvent, ignored: string) {
  const row = event.locked.row;
  const view = protocolView({ step: { state: row.state, directives: [] }, row, timezone: null });
  return { view: () => ({ ...view, ignored }) };
}

/** Fecha o turno: limpa o início pendente e conta a interlocução (A7). */
function closedTurn(event: LockedEvent, turnId: string) {
  return {
    leadSpeechStartedSeq: null,
    leadTurnId: null,
    lastFinalTurnId: turnId,
    leadFinalUtterances: event.locked.row.leadFinalUtterances + 1,
  };
}

/**
 * Opt-out JÁ gravado nesta sessão: nenhuma fala posterior move o protocolo —
 * nada de lista, releitura ou reserva (o turno ainda é fechado e contado).
 */
async function afterRecordedOptOut(event: LockedEvent, turnId: string) {
  const next = await reserveSeq(event.tx, event.locked, closedTurn(event, turnId));
  const step = { state: next.row.state, directives: [] };
  return {
    view: () => protocolView({ step, row: next.row, timezone: null, refusal: 'OPT_OUT_REQUESTED' }),
  };
}

async function handleUtterance(event: LockedEvent, utterance: Utterance) {
  const { tx, locked, now } = event;
  const refusal = turnRefusal(event, utterance.turnId);
  if (refusal) return ignoredView(event, refusal);
  if (locked.row.optOutRecordedAt) return afterRecordedOptOut(event, utterance.turnId);
  const startedSeq = locked.row.leadSpeechStartedSeq!;
  const decision = decideUtterance(utterance.text, locked.row, startedSeq);
  const questionReset = decision.clearQuestion
    ? { optOutQuestionGeneration: null, optOutQuestionDeliveredSeq: null }
    : {};
  const applied = await applyProtocolEvent(tx, locked, {
    body: { type: 'LEAD_FINAL_UTTERANCE', startedSeq, intent: decision.intent },
    now,
    options: {
      ...closedTurn(event, utterance.turnId),
      optOutPending: decision.pending,
      ...questionReset,
    },
  });
  const recorded = await maybeRecordOptOut(event, { applied, source: decision.recordOptOut });
  const row = recorded?.locked.row ?? applied.locked.row;
  const resumed = locked.row.optOutPending && !decision.pending && !decision.recordOptOut;
  const step = guidedStep(applied.step, { pending: decision.pending, resumed });
  return { view: (timezone: string | null) => protocolView({ step, row, timezone }) };
}

export function recordLeadUtterance(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  utterance: Utterance,
): Promise<SchedulingProtocolView> {
  assertTransportId(utterance?.turnId, 'lead turn id');
  if (typeof utterance.text !== 'string') throw new TypeError('A final utterance must be text.');
  return withLockedProtocol(deps, { scope, lockLead: true }, (event) =>
    handleUtterance(event, utterance),
  );
}
