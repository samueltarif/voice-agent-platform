import type {
  BookingProtocolStep,
  SchedulingAgentScope,
  SchedulingProtocolView,
} from '@voice-agent/contracts';
import { decideUtterance } from './scheduling-agent-clarification.js';
import {
  withLockedProtocol,
  type LockedEvent,
  type SchedulingEventDeps,
} from './scheduling-agent-events.js';
import { recordCanonicalOptOut, type OptOutSource } from './scheduling-agent-opt-out.js';
import { protocolView } from './scheduling-agent-view.js';
import { applyProtocolEvent, reserveSeq } from './scheduling-protocol-store.js';

/**
 * E2 PR 3 (DEC-075, D2) — fala FINAL do interlocutor, classificada no
 * servidor. Opt-out reconhecido (pedido inequívoco ou "sim" à pergunta de
 * esclarecimento entregue) é gravado na supressão canônica NA MESMA
 * transação, sem depender do modelo nem do toolset.
 */

/**
 * "Não" claro à pergunta de esclarecimento: a abordagem comercial recomeça do
 * zero. Se o protocolo já estava parado (`IDLE`), o harness ainda recebe o
 * pedido de nova lista — nunca o consentimento anterior à pergunta.
 */
function resumedStep(step: BookingProtocolStep, resumed: boolean): BookingProtocolStep {
  if (!resumed || step.state.phase !== 'IDLE' || step.directives.length > 0) return step;
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

/**
 * Opt-out JÁ gravado nesta sessão (fala ou ferramenta): nenhuma fala posterior
 * move o protocolo — nada de lista, releitura ou reserva (autorrevisão PR 3:
 * pela ferramenta, a fase do redutor não muda e a abordagem poderia seguir).
 */
async function afterRecordedOptOut(event: LockedEvent) {
  const next = await reserveSeq(event.tx, event.locked, { leadSpeechStartedSeq: null });
  const step = { state: next.row.state, directives: [] };
  return {
    view: () => protocolView({ step, row: next.row, timezone: null, refusal: 'OPT_OUT_REQUESTED' }),
  };
}

async function handleUtterance(event: LockedEvent, text: string) {
  const { tx, locked, now } = event;
  const startedSeq = locked.row.leadSpeechStartedSeq;
  if (startedSeq === null) {
    const step = { state: locked.row.state, directives: [] };
    const view = protocolView({ step, row: locked.row, timezone: null });
    return { view: () => ({ ...view, ignored: 'UTTERANCE_WITHOUT_START' }) };
  }
  if (locked.row.optOutRecordedAt) return afterRecordedOptOut(event);
  const decision = decideUtterance(text, locked.row, startedSeq);
  const questionReset = decision.clearQuestion
    ? { optOutQuestionGeneration: null, optOutQuestionDeliveredSeq: null }
    : {};
  const applied = await applyProtocolEvent(tx, locked, {
    body: { type: 'LEAD_FINAL_UTTERANCE', startedSeq, intent: decision.intent },
    now,
    options: { leadSpeechStartedSeq: null, optOutPending: decision.pending, ...questionReset },
  });
  const recorded = await maybeRecordOptOut(event, { applied, source: decision.recordOptOut });
  const row = recorded?.locked.row ?? applied.locked.row;
  const step = resumedStep(
    applied.step,
    locked.row.optOutPending && !decision.pending && !decision.recordOptOut,
  );
  return { view: (timezone: string | null) => protocolView({ step, row, timezone }) };
}

export function recordLeadUtterance(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  text: string,
): Promise<SchedulingProtocolView> {
  if (typeof text !== 'string') throw new TypeError('A final utterance must be text.');
  return withLockedProtocol(deps, { scope, lockLead: true }, (event) =>
    handleUtterance(event, text),
  );
}
