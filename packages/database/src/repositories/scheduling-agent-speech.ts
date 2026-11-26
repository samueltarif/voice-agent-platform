import type {
  SchedulingAgentScope,
  SchedulingProtocolView,
  SchedulingSpeechEvent,
} from '@voice-agent/contracts';
import {
  withLockedProtocol,
  type LockedEvent,
  type SchedulingEventDeps,
} from './scheduling-agent-events.js';
import { protocolView } from './scheduling-agent-view.js';
import {
  applyProtocolEvent,
  reserveSeq,
  type LockedProtocol,
} from './scheduling-protocol-store.js';

/**
 * E2 PR 2/3 + auditoria consolidada — eventos de FALA do agente vindos do
 * transporte confiável: lista e releitura (redutor), pergunta de
 * esclarecimento de opt-out (fora do redutor) e OUTRA fala do agente (A1).
 */

const SPEECH_TYPES = new Set(['SPEECH_STARTED', 'SPEECH_COMPLETED', 'SPEECH_INTERRUPTED']);
const MAX_ID_CHARS = 128;
const isId = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_CHARS;

function validStart(event: SchedulingSpeechEvent): boolean {
  if (event.type !== 'SPEECH_STARTED' || !('listRevision' in event)) return true;
  const offerOk = event.offerId === undefined || isId(event.offerId);
  return Number.isSafeInteger(event.listRevision) && event.listRevision > 0 && offerOk;
}

/** O harness é confiável, mas o formato é conferido antes de entrar no estado persistido. */
function assertSpeechEvent(event: SchedulingSpeechEvent): void {
  if (!SPEECH_TYPES.has(event.type) || !isId(event.generationId) || !validStart(event)) {
    throw new TypeError('Invalid speech event from the transport.');
  }
}

/**
 * Pergunta de esclarecimento de possível opt-out (E2 PR 3): fora do redutor.
 * Início registra a geração; a conclusão da MESMA geração marca a entrega UMA
 * vez; interrupção invalida a geração DEFINITIVAMENTE (auditoria A4: conclusão
 * atrasada ou repetida não restaura nada; exige nova geração e nova entrega).
 */
function questionOptions(row: LockedProtocol['row'], speech: SchedulingSpeechEvent) {
  if (!row.optOutPending) return {};
  if (speech.type === 'SPEECH_STARTED') {
    return { optOutQuestionGeneration: speech.generationId, optOutQuestionDeliveredSeq: null };
  }
  if (speech.type === 'SPEECH_INTERRUPTED') {
    return { optOutQuestionGeneration: null, optOutQuestionDeliveredSeq: null };
  }
  return row.optOutQuestionDeliveredSeq === null ? { optOutQuestionDeliveredSeq: row.seq + 1 } : {};
}

async function onQuestionSpeech(event: LockedEvent, speech: SchedulingSpeechEvent) {
  const next = await reserveSeq(event.tx, event.locked, questionOptions(event.locked.row, speech));
  const step = { state: next.row.state, directives: [] };
  return { view: (timezone: string | null) => protocolView({ step, row: next.row, timezone }) };
}

function isQuestionSpeech(row: LockedProtocol['row'], speech: SchedulingSpeechEvent): boolean {
  if (speech.type === 'SPEECH_STARTED') return speech.purpose === 'OPT_OUT_QUESTION';
  return (
    row.optOutQuestionGeneration !== null && speech.generationId === row.optOutQuestionGeneration
  );
}

/**
 * A1: OUTRA fala do agente (texto do modelo) começou. Invalida a pergunta
 * transacional em aberto (lista ou releitura, no redutor) e a pergunta de
 * esclarecimento de opt-out já entregue: a próxima resposta não vale.
 */
async function onAgentSpeech(event: LockedEvent, generationId: string) {
  const applied = await applyProtocolEvent(event.tx, event.locked, {
    body: { type: 'AGENT_SPEECH_STARTED', generationId },
    now: event.now,
    options: { optOutQuestionGeneration: null, optOutQuestionDeliveredSeq: null },
  });
  return {
    view: (timezone: string | null) =>
      protocolView({ ...applied, row: applied.locked.row, timezone }),
  };
}

function dispatchSpeech(event: LockedEvent, speech: SchedulingSpeechEvent) {
  if (speech.type === 'SPEECH_STARTED' && speech.purpose === 'AGENT') {
    return onAgentSpeech(event, speech.generationId);
  }
  if (isQuestionSpeech(event.locked.row, speech)) return onQuestionSpeech(event, speech);
  return null;
}

export function recordSpeech(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  speech: SchedulingSpeechEvent,
): Promise<SchedulingProtocolView> {
  assertSpeechEvent(speech);
  return withLockedProtocol(deps, { scope, lockLead: false }, async (event) => {
    const special = dispatchSpeech(event, speech);
    if (special) return special;
    const body = { ...speech } as Parameters<typeof applyProtocolEvent>[2]['body'];
    const applied = await applyProtocolEvent(event.tx, event.locked, { body, now: event.now });
    return {
      view: (timezone) => protocolView({ ...applied, row: applied.locked.row, timezone }),
    };
  });
}
