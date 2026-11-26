import type {
  SchedulingAgentScope,
  SchedulingProtocolView,
  SchedulingSessionContextPort,
  SchedulingSpeechEvent,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import type { LeadEntity } from '../schema/leads.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockLead } from './lead-status-writer.js';
import { leadIdForPhone } from './scheduling-agent-opt-out.js';
import { calendarTimezone, resolveAgentScope } from './scheduling-agent-scope.js';
import { protocolView, unchangedView } from './scheduling-agent-view.js';
import {
  applyProtocolEvent,
  lockProtocol,
  reserveSeq,
  type LockedProtocol,
  type SchedulingBinding,
} from './scheduling-protocol-store.js';

/**
 * E2 PR 2/3 (DEC-075) — eventos do HARNESS confiável (transporte/TTS e
 * transcrição final), nunca do modelo. O servidor atribui `seq` e `at`.
 * Ordem de travas: lead (L, quando o evento pode gravar opt-out) → A → S;
 * a supressão (P) é sempre a última (`recordCanonicalOptOut`).
 */

export interface SchedulingEventDeps {
  readonly db: DatabaseInstance;
  readonly resolver: SchedulingSessionContextPort;
  readonly clock: () => Date;
}

export interface LockedEvent {
  readonly tx: DatabaseExecutor;
  readonly locked: LockedProtocol;
  readonly now: Date;
  readonly binding: SchedulingBinding;
  readonly lead: LeadEntity | null;
  readonly phoneE164: string;
}

type Handler = (
  event: LockedEvent,
) => Promise<{ readonly view: (timezone: string | null) => SchedulingProtocolView }>;

export const CONTEXT_REFUSED_VIEW: SchedulingProtocolView = Object.freeze({
  phase: 'IDLE',
  directives: [],
  speech: null,
  ignored: null,
  optOutClarificationPending: false,
  refusal: 'CONTEXT_REFUSED',
});

/** Trava (L →) S, encerra o protocolo se a sessão já não está ativa e executa o evento. */
export async function withLockedProtocol(
  deps: SchedulingEventDeps,
  request: { readonly scope: SchedulingAgentScope; readonly lockLead: boolean },
  handler: Handler,
): Promise<SchedulingProtocolView> {
  const { scope } = request;
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return CONTEXT_REFUSED_VIEW;
  const { binding, destinationPhoneE164: phoneE164 } = resolved;
  const calendarId = resolved.scheduling?.calendarId;
  const organizationId = binding.organizationId;
  const timezone = calendarId
    ? await calendarTimezone(deps.db, { organizationId, calendarId })
    : null;
  const leadId = request.lockLead
    ? await leadIdForPhone(deps.db, { organizationId, phoneE164 })
    : null;
  const result = await deps.db.transaction(async (tx) => {
    const lead = leadId ? await lockLead(tx, organizationId, leadId) : null;
    const locked = await lockProtocol(tx, binding);
    if (!locked) return { view: () => CONTEXT_REFUSED_VIEW };
    const now = deps.clock();
    if (!locked.active) return closeProtocol(tx, locked, now);
    return handler({ tx, locked, now, binding, lead, phoneE164 });
  });
  return result.view(timezone);
}

/** Sessão encerrada/revogada: `SESSION_CLOSED` anula lista e autorização não consumida. */
async function closeProtocol(tx: DatabaseExecutor, locked: LockedProtocol, now: Date) {
  if (locked.row.state.phase === 'CLOSED') {
    return { view: () => unchangedView(locked.row, 'SESSION_NOT_ACTIVE') };
  }
  const applied = await applyProtocolEvent(tx, locked, { body: { type: 'SESSION_CLOSED' }, now });
  const row = applied.locked.row;
  return {
    view: () =>
      protocolView({ step: applied.step, row, timezone: null, refusal: 'SESSION_NOT_ACTIVE' }),
  };
}

const SPEECH_TYPES = new Set(['SPEECH_STARTED', 'SPEECH_COMPLETED', 'SPEECH_INTERRUPTED']);
const MAX_ID_CHARS = 128;
const isId = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_CHARS;

function validStart(event: SchedulingSpeechEvent): boolean {
  if (event.type !== 'SPEECH_STARTED' || event.purpose === 'OPT_OUT_QUESTION') return true;
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
 * Início registra a geração; conclusão da MESMA geração marca a entrega;
 * interrupção exige perguntar de novo. Sem esclarecimento pendente, é ignorada.
 */
async function onQuestionSpeech(event: LockedEvent, speech: SchedulingSpeechEvent) {
  const row = event.locked.row;
  const isStart = speech.type === 'SPEECH_STARTED';
  const options = !row.optOutPending
    ? {}
    : isStart
      ? { optOutQuestionGeneration: speech.generationId, optOutQuestionDeliveredSeq: null }
      : { optOutQuestionDeliveredSeq: speech.type === 'SPEECH_COMPLETED' ? row.seq + 1 : null };
  const next = await reserveSeq(event.tx, event.locked, options);
  const step = { state: next.row.state, directives: [] };
  return { view: (timezone: string | null) => protocolView({ step, row: next.row, timezone }) };
}

function isQuestionSpeech(row: LockedProtocol['row'], speech: SchedulingSpeechEvent): boolean {
  if (speech.type === 'SPEECH_STARTED') return speech.purpose === 'OPT_OUT_QUESTION';
  return (
    row.optOutQuestionGeneration !== null && speech.generationId === row.optOutQuestionGeneration
  );
}

export function recordSpeech(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  speech: SchedulingSpeechEvent,
): Promise<SchedulingProtocolView> {
  assertSpeechEvent(speech);
  return withLockedProtocol(deps, { scope, lockLead: false }, async (event) => {
    if (isQuestionSpeech(event.locked.row, speech)) return onQuestionSpeech(event, speech);
    const body = { ...speech } as Parameters<typeof applyProtocolEvent>[2]['body'];
    const applied = await applyProtocolEvent(event.tx, event.locked, { body, now: event.now });
    return {
      view: (timezone) => protocolView({ ...applied, row: applied.locked.row, timezone }),
    };
  });
}

export function recordLeadSpeechStarted(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
): Promise<SchedulingProtocolView> {
  return withLockedProtocol(deps, { scope, lockLead: false }, async ({ tx, locked }) => {
    // Vários inícios sem fala final: vale o PRIMEIRO (mais conservador).
    const started = locked.row.leadSpeechStartedSeq ?? locked.row.seq + 1;
    const next = await reserveSeq(tx, locked, { leadSpeechStartedSeq: started });
    const step = { state: next.row.state, directives: [] };
    return { view: (timezone) => protocolView({ step, row: next.row, timezone }) };
  });
}
