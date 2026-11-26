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

async function withLeadLocks<T>(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  run: (ctx: LeadTx) => Promise<T>,
): Promise<Locked<T>> {
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
    if (!locked.active) {
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

async function applyOutcome(
  ctx: LeadTx,
  outcome: RecordOutcomeArguments['outcome'],
): Promise<RecordOutcomeResult> {
  if (!ctx.lead) return { status: 'REFUSED', reason: 'NO_LEAD_FOR_DESTINATION' };
  const row = ctx.locked.row;
  if (row.state.phase === 'OPTED_OUT' || row.optOutRecordedAt) {
    return { status: 'REFUSED', reason: 'OPT_OUT_REQUESTED' };
  }
  if (row.optOutPending) return { status: 'REFUSED', reason: 'OPT_OUT_CLARIFICATION_PENDING' };
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
  const result = await withLeadLocks(deps, scope, (ctx) => applyOutcome(ctx, args.outcome));
  return 'refusal' in result ? { status: 'REFUSED', reason: result.refusal } : result.value;
}

async function applyOptOut(ctx: LeadTx): Promise<RecordOptOutResult> {
  const meetingAlready = ctx.lead?.status === 'MEETING_SCHEDULED';
  if (ctx.locked.row.optOutRecordedAt) {
    // Idempotente: já gravado nesta sessão (fala ou ferramenta); nada novo.
    return {
      status: 'RECORDED',
      meetingPreserved: meetingAlready,
      speech: SCHEDULING_SPEECH.OPT_OUT_RECORDED,
    };
  }
  const recorded = await recordCanonicalOptOut(ctx.tx, ctx.locked, {
    lead: ctx.lead,
    organizationId: ctx.binding.organizationId,
    sessionId: ctx.binding.sessionId,
    phoneE164: ctx.phoneE164,
    actor: { type: 'AGENT', id: ctx.binding.agentId },
    source: 'AGENT_TOOL',
    now: ctx.now,
  });
  return {
    status: 'RECORDED',
    meetingPreserved: recorded.meetingPreserved,
    speech: SCHEDULING_SPEECH.OPT_OUT_RECORDED,
  };
}

export async function recordOptOut(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
): Promise<RecordOptOutResult> {
  const result = await withLeadLocks(deps, scope, applyOptOut);
  if ('value' in result) return result.value;
  const speech =
    result.refusal === 'SESSION_NOT_ACTIVE'
      ? renderRefusalSpeech('SESSION_NOT_ACTIVE')
      : renderRefusalSpeech('CONTEXT_REFUSED');
  return { status: 'REFUSED', reason: result.refusal, speech };
}
