import {
  renderRefusalSpeech,
  SCHEDULING_SPEECH,
  type LeadToolRefusal,
  type RecordOptOutResult,
  type RecordOutcomeArguments,
  type RecordOutcomeResult,
  type SchedulingAgentScope,
} from '@voice-agent/contracts';
import type { LeadEntity } from '../schema/leads.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyLeadStatusChange, lockLead } from './lead-status-writer.js';
import type { SchedulingEventDeps } from './scheduling-agent-events.js';
import { leadIdForPhone, recordCanonicalOptOut } from './scheduling-agent-opt-out.js';
import { resolveAgentScope } from './scheduling-agent-scope.js';
import {
  applyProtocolEvent,
  lockProtocol,
  type LockedProtocol,
  type SchedulingBinding,
} from './scheduling-protocol-store.js';

/**
 * E2 PR 3 (DEC-075, D2/D5) — `lead.record_outcome` e `lead.record_opt_out`.
 * Lead e telefone vêm do contexto confiável; ordem L → A → S (→ P no opt-out).
 * Sessão inativa nunca aceita pedido NOVO.
 */

interface LeadTx {
  readonly tx: DatabaseExecutor;
  readonly locked: LockedProtocol;
  readonly lead: LeadEntity | null;
  readonly binding: SchedulingBinding;
  readonly phoneE164: string;
  readonly now: Date;
}

type Locked<T> = { readonly refusal: LeadToolRefusal } | { readonly value: T };

interface LeadLockRequest {
  readonly scope: SchedulingAgentScope;
  /** Recuperação de evidência JÁ reconhecida é aceita mesmo com a sessão encerrada. */
  readonly allowInactive: boolean;
}

async function withLeadLocks<T>(
  deps: SchedulingEventDeps,
  request: LeadLockRequest,
  run: (ctx: LeadTx) => Promise<T>,
): Promise<Locked<T>> {
  const { scope } = request;
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return { refusal: 'CONTEXT_REFUSED' };
  const { binding, destinationPhoneE164: phoneE164 } = resolved;
  const organizationId = binding.organizationId;
  const leadId = await leadIdForPhone(deps.db, { organizationId, phoneE164 });
  return deps.db.transaction(async (tx): Promise<Locked<T>> => {
    const lead = leadId ? await lockLead(tx, organizationId, leadId) : null;
    const locked = await lockProtocol(tx, binding);
    if (!locked) return { refusal: 'CONTEXT_REFUSED' };
    const now = deps.clock();
    if (!locked.active && !request.allowInactive) {
      if (locked.row.state.phase !== 'CLOSED') {
        await applyProtocolEvent(tx, locked, { body: { type: 'SESSION_CLOSED' }, now });
      }
      return { refusal: 'SESSION_NOT_ACTIVE' };
    }
    return { value: await run({ tx, locked, lead, binding, phoneE164, now }) };
  });
}

const OUTCOME_REFUSAL: Readonly<Record<string, LeadToolRefusal>> = {
  ACTIVE_MEETING_PRESERVED: 'MEETING_PRESERVED',
  LEAD_DO_NOT_CALL: 'LEAD_DO_NOT_CALL',
};

function outcomeBlocked(row: LeadTx['locked']['row']): LeadToolRefusal | null {
  // A7: só com interlocução confiável (fala final do interlocutor processada nesta sessão);
  // silêncio, ausência de resposta ou falha técnica nunca viram resultado comercial.
  if (row.leadFinalUtterances < 1) return 'NO_INTERLOCUTION';
  if (row.state.phase === 'OPTED_OUT' || row.optOutRecordedAt) return 'OPT_OUT_REQUESTED';
  return row.optOutPending ? 'OPT_OUT_CLARIFICATION_PENDING' : null;
}

async function applyOutcome(
  ctx: LeadTx,
  outcome: RecordOutcomeArguments['outcome'],
): Promise<RecordOutcomeResult> {
  if (!ctx.lead) return { status: 'REFUSED', reason: 'NO_LEAD_FOR_DESTINATION' };
  const blocked = outcomeBlocked(ctx.locked.row);
  if (blocked) return { status: 'REFUSED', reason: blocked };
  const changed = await applyLeadStatusChange(ctx.tx, {
    lead: ctx.lead,
    to: outcome,
    origin: 'CALL_OUTCOME',
    actor: { type: 'AGENT', id: ctx.binding.agentId },
  });
  if (changed.kind === 'CHANGED') return { status: 'RECORDED', outcome };
  if (changed.reason === 'SAME_STATUS') return { status: 'ALREADY_RECORDED', outcome };
  return { status: 'REFUSED', reason: OUTCOME_REFUSAL[changed.reason] ?? 'TRANSITION_NOT_ALLOWED' };
}

export async function recordOutcome(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  args: RecordOutcomeArguments,
): Promise<RecordOutcomeResult> {
  const request = { scope, allowInactive: false };
  const result = await withLeadLocks(deps, request, (ctx) => applyOutcome(ctx, args.outcome));
  return 'refusal' in result ? { status: 'REFUSED', reason: result.refusal } : result.value;
}

/**
 * A2: a ferramenta NUNCA cria um opt-out. Só conclui ou recupera um pedido
 * que o servidor reconheceu na fala do interlocutor nesta sessão — evidência
 * do protocolo (`optOutSeq`, escrito só pelo redutor a partir do classificador).
 * O caminho obrigatório é automático, na própria fala final.
 */
async function applyOptOut(ctx: LeadTx): Promise<RecordOptOutResult> {
  const row = ctx.locked.row;
  const speech = SCHEDULING_SPEECH.OPT_OUT_RECORDED;
  if (row.optOutRecordedAt) {
    return {
      status: 'RECORDED',
      meetingPreserved: ctx.lead?.status === 'MEETING_SCHEDULED',
      speech,
    };
  }
  if (row.state.optOutSeq === null) {
    return {
      status: 'REFUSED',
      reason: 'NO_OPT_OUT_EVIDENCE',
      speech: renderRefusalSpeech('NOT_AUTHORIZED'),
    };
  }
  const recorded = await recordCanonicalOptOut(ctx.tx, ctx.locked, {
    lead: ctx.lead,
    organizationId: ctx.binding.organizationId,
    sessionId: ctx.binding.sessionId,
    phoneE164: ctx.phoneE164,
    actor: { type: 'AGENT', id: ctx.binding.agentId },
    source: 'RECOVERY',
    now: ctx.now,
  });
  return { status: 'RECORDED', meetingPreserved: recorded.meetingPreserved, speech };
}

export async function recordOptOut(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
): Promise<RecordOptOutResult> {
  const result = await withLeadLocks(deps, { scope, allowInactive: true }, applyOptOut);
  if ('value' in result) return result.value;
  const speech =
    result.refusal === 'SESSION_NOT_ACTIVE'
      ? renderRefusalSpeech('SESSION_NOT_ACTIVE')
      : renderRefusalSpeech('CONTEXT_REFUSED');
  return { status: 'REFUSED', reason: result.refusal, speech };
}
