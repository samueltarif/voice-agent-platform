import type {
  LeadTurn,
  SchedulingAgentScope,
  SchedulingProtocolView,
  SchedulingSessionContextPort,
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

const MAX_ID_CHARS = 128;

/** Identificadores do TRANSPORTE (geração de fala, turno): formato conferido antes de persistir. */
export function assertTransportId(value: unknown, what: string): void {
  const ok = typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_CHARS;
  if (!ok) throw new TypeError(`Invalid ${what} from the transport.`);
}

/**
 * O interlocutor começou a falar no turno `turnId` (do transporte). Um turno
 * NOVO substitui um início pendente de outro turno (que não terminou); o
 * mesmo turno repetido não muda nada.
 */
export function recordLeadSpeechStarted(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  turn: LeadTurn,
): Promise<SchedulingProtocolView> {
  assertTransportId(turn?.turnId, 'lead turn id');
  return withLockedProtocol(deps, { scope, lockLead: false }, async ({ tx, locked }) => {
    const row = locked.row;
    const same = row.leadTurnId === turn.turnId && row.leadSpeechStartedSeq !== null;
    const options = same ? {} : { leadSpeechStartedSeq: row.seq + 1, leadTurnId: turn.turnId };
    const next = await reserveSeq(tx, locked, options);
    const step = { state: next.row.state, directives: [] };
    return { view: (timezone) => protocolView({ step, row: next.row, timezone }) };
  });
}
