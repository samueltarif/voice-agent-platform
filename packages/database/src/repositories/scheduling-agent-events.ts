import {
  classifyLeadReply,
  mentionsOptOut,
  type LeadReplyIntent,
  type SchedulingAgentScope,
  type SchedulingProtocolView,
  type SchedulingSessionContextPort,
  type SchedulingSpeechEvent,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import type { DatabaseExecutor } from './database-executor.js';
import { calendarTimezone, resolveAgentScope } from './scheduling-agent-scope.js';
import { protocolView, unchangedView } from './scheduling-agent-view.js';
import {
  applyProtocolEvent,
  lockProtocol,
  reserveSeq,
  type LockedProtocol,
} from './scheduling-protocol-store.js';

/**
 * E2 PR 2 (DEC-075) — eventos do HARNESS confiável (transporte/TTS e
 * transcrição final), nunca do modelo. O servidor atribui `seq` e `at`; a
 * fala do interlocutor é classificada aqui (`classifyLeadReply`), e o início
 * da fala é uma marca do servidor (`deliveredSeq < startedSeq ≤ seq`).
 */

export interface SchedulingEventDeps {
  readonly db: DatabaseInstance;
  readonly resolver: SchedulingSessionContextPort;
  readonly clock: () => Date;
}

type Handler = (
  tx: DatabaseExecutor,
  locked: LockedProtocol,
  now: Date,
) => Promise<{ readonly view: (timezone: string | null) => SchedulingProtocolView }>;

const MAX_UTTERANCE_CHARS = 4_000;
const CONTEXT_REFUSED: SchedulingProtocolView = Object.freeze({
  phase: 'IDLE',
  directives: [],
  speech: null,
  ignored: null,
  optOutClarificationPending: false,
  refusal: 'CONTEXT_REFUSED',
});

/** Trava S, encerra o protocolo se a sessão já não está ativa e executa o evento. */
export async function withLockedProtocol(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  handler: Handler,
): Promise<SchedulingProtocolView> {
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return CONTEXT_REFUSED;
  const calendarId = resolved.scheduling?.calendarId;
  const timezone = calendarId
    ? await calendarTimezone(deps.db, { organizationId: scope.organizationId, calendarId })
    : null;
  const result = await deps.db.transaction(async (tx) => {
    const locked = await lockProtocol(tx, resolved.binding);
    if (!locked) return { view: () => CONTEXT_REFUSED };
    const now = deps.clock();
    if (!locked.active) return closeProtocol(tx, locked, now);
    return handler(tx, locked, now);
  });
  return result.view(timezone);
}

/** Sessão encerrada/revogada: `SESSION_CLOSED` anula lista e autorização não consumida. */
async function closeProtocol(tx: DatabaseExecutor, locked: LockedProtocol, now: Date) {
  if (locked.row.state.phase === 'CLOSED') {
    return { view: () => unchangedView(locked.row, 'SESSION_NOT_ACTIVE') };
  }
  const applied = await applyProtocolEvent(tx, locked, { body: { type: 'SESSION_CLOSED' }, now });
  return {
    view: () =>
      protocolView({
        step: applied.step,
        row: applied.locked.row,
        timezone: null,
        refusal: 'SESSION_NOT_ACTIVE',
      }),
  };
}

const SPEECH_TYPES = new Set(['SPEECH_STARTED', 'SPEECH_COMPLETED', 'SPEECH_INTERRUPTED']);
const MAX_ID_CHARS = 128;
const isId = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_CHARS;

/** O harness é confiável, mas o formato é conferido antes de entrar no estado persistido. */
function assertSpeechEvent(event: SchedulingSpeechEvent): void {
  const valid =
    SPEECH_TYPES.has(event.type) &&
    isId(event.generationId) &&
    (event.type !== 'SPEECH_STARTED' ||
      (Number.isSafeInteger(event.listRevision) &&
        event.listRevision > 0 &&
        (event.offerId === undefined || isId(event.offerId))));
  if (!valid) throw new TypeError('Invalid speech event from the transport.');
}

export function recordSpeech(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  event: SchedulingSpeechEvent,
): Promise<SchedulingProtocolView> {
  assertSpeechEvent(event);
  return withLockedProtocol(deps, scope, async (tx, locked, now) => {
    const applied = await applyProtocolEvent(tx, locked, { body: { ...event }, now });
    return { view: (timezone) => protocolView({ ...applied, row: applied.locked.row, timezone }) };
  });
}

export function recordLeadSpeechStarted(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
): Promise<SchedulingProtocolView> {
  return withLockedProtocol(deps, scope, async (tx, locked) => {
    // Vários inícios sem fala final: vale o PRIMEIRO (mais conservador).
    const started = locked.row.leadSpeechStartedSeq ?? locked.row.seq + 1;
    const next = await reserveSeq(tx, locked, { leadSpeechStartedSeq: started });
    const step = { state: next.row.state, directives: [] };
    return { view: (timezone) => protocolView({ step, row: next.row, timezone }) };
  });
}

function effectiveIntent(
  text: string,
  pending: boolean,
): { intent: LeadReplyIntent; pending: boolean } {
  const intent: LeadReplyIntent =
    text.length > MAX_UTTERANCE_CHARS ? { kind: 'AMBIGUOUS' } : classifyLeadReply(text);
  if (intent.kind === 'OPT_OUT') return { intent, pending };
  // Possível opt-out em esclarecimento: nenhuma intenção comercial avança (D2).
  const nowPending = pending || mentionsOptOut(text.slice(0, MAX_UTTERANCE_CHARS));
  return { intent: nowPending ? { kind: 'AMBIGUOUS' } : intent, pending: nowPending };
}

export function recordLeadUtterance(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  text: string,
): Promise<SchedulingProtocolView> {
  if (typeof text !== 'string') throw new TypeError('A final utterance must be text.');
  return withLockedProtocol(deps, scope, async (tx, locked, now) => {
    const startedSeq = locked.row.leadSpeechStartedSeq;
    if (startedSeq === null) {
      const row = locked.row;
      const step = { state: row.state, directives: [] };
      const ignored = 'UTTERANCE_WITHOUT_START';
      return { view: () => ({ ...protocolView({ step, row, timezone: null }), ignored }) };
    }
    const decided = effectiveIntent(text, locked.row.optOutPending);
    const applied = await applyProtocolEvent(tx, locked, {
      body: { type: 'LEAD_FINAL_UTTERANCE', startedSeq, intent: decided.intent },
      now,
      options: { leadSpeechStartedSeq: null, optOutPending: decided.pending },
    });
    return { view: (timezone) => protocolView({ ...applied, row: applied.locked.row, timezone }) };
  });
}
