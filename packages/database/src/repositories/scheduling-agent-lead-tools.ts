import {
  renderRefusalSpeech,
  SCHEDULING_SPEECH,
  type LeadToolRefusal,
  type RecordOptOutArguments,
  type RecordOptOutResult,
  type RecordOutcomeArguments,
  type RecordOutcomeResult,
  type SchedulingAgentScope,
} from '@voice-agent/contracts';
import type { LeadEntity } from '../schema/leads.js';
import { closePendingIntent } from './booking-intent-store.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockLead } from './lead-status-writer.js';
import {
  ensureReconciliation,
  lockReconciliation,
  updateReconciliation,
} from './post-call-reconciliation-store.js';
import type { SchedulingEventDeps } from './scheduling-agent-deps.js';
import { leadIdForPhone, recordCanonicalOptOut } from './scheduling-agent-opt-out.js';
import { resolveAgentScope } from './scheduling-agent-scope.js';
import {
  lockProtocol,
  type LockedProtocol,
  type SchedulingBinding,
} from './scheduling-protocol-store.js';

/**
 * E2 (DEC-075 D2/D5; simplificada pela DEC-077) — `lead.record_opt_out` e
 * `lead.record_outcome`. Lead e telefone vêm do contexto confiável.
 * - opt-out: supressão canônica PREVENTIVA e imediata (fail-safe), sem exigir
 *   evidência; cancela a intenção de agendamento pendente; aceito também com
 *   a sessão encerrada. Ordem L → A → S → I → R → P.
 * - resultado: só PROPOSTO (R); aplicado na reconciliação pós-chamada com
 *   interlocução comprovada no histórico; recusado depois do relatório final
 *   (A6). Ordem A → S → R. O opt-out tardio continua preventivo.
 */

interface LeadTx {
  readonly tx: DatabaseExecutor;
  readonly locked: LockedProtocol;
  readonly lead: LeadEntity | null;
  readonly binding: SchedulingBinding;
  readonly phoneE164: string;
  readonly leadId: string | null;
  readonly now: Date;
}

type Locked<T> = { readonly refusal: LeadToolRefusal } | { readonly value: T };

async function withLeadLocks<T>(
  deps: SchedulingEventDeps,
  request: { readonly scope: SchedulingAgentScope; readonly lockLead: boolean },
  run: (ctx: LeadTx) => Promise<T>,
): Promise<Locked<T>> {
  const resolved = await resolveAgentScope(deps.resolver, request.scope);
  if (!resolved.ok) return { refusal: 'CONTEXT_REFUSED' };
  const { binding, destinationPhoneE164: phoneE164 } = resolved;
  const organizationId = binding.organizationId;
  const leadId = await leadIdForPhone(deps.db, { organizationId, phoneE164 });
  return deps.db.transaction(async (tx): Promise<Locked<T>> => {
    const lead = leadId && request.lockLead ? await lockLead(tx, organizationId, leadId) : null;
    const locked = await lockProtocol(tx, binding);
    if (!locked) return { refusal: 'CONTEXT_REFUSED' };
    const now = deps.clock();
    return { value: await run({ tx, locked, lead, binding, phoneE164, now, leadId }) };
  });
}

const keyOf = (binding: SchedulingBinding) => ({
  organizationId: binding.organizationId,
  sessionId: binding.sessionId,
});

async function proposeOutcome(
  ctx: LeadTx,
  outcome: RecordOutcomeArguments['outcome'],
): Promise<RecordOutcomeResult> {
  if (!ctx.locked.active) return { status: 'REFUSED', reason: 'SESSION_NOT_ACTIVE' };
  if (ctx.locked.row.optOutRecordedAt) return { status: 'REFUSED', reason: 'OPT_OUT_REQUESTED' };
  await ensureReconciliation(ctx.tx, ctx.binding, {
    phoneE164: ctx.phoneE164,
    leadId: ctx.leadId,
    now: ctx.now,
  });
  // A6: relatório final já registrado — nenhuma nova operação comercial na sessão.
  const row = await lockReconciliation(ctx.tx, keyOf(ctx.binding));
  if (row?.reportDigest) return { status: 'REFUSED', reason: 'SESSION_NOT_ACTIVE' };
  await updateReconciliation(ctx.tx, keyOf(ctx.binding), { proposedOutcome: outcome });
  return { status: 'PROPOSED', outcome };
}

export async function recordOutcome(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  args: RecordOutcomeArguments,
): Promise<RecordOutcomeResult> {
  const result = await withLeadLocks(deps, { scope, lockLead: false }, (ctx) =>
    proposeOutcome(ctx, args.outcome),
  );
  return 'refusal' in result ? { status: 'REFUSED', reason: result.refusal } : result.value;
}

async function preventiveOptOut(
  ctx: LeadTx,
  args: RecordOptOutArguments,
): Promise<RecordOptOutResult> {
  const key = keyOf(ctx.binding);
  await closePendingIntent(ctx.tx, key, { status: 'CANCELED', reason: 'OPT_OUT', now: ctx.now });
  await ensureReconciliation(ctx.tx, ctx.binding, {
    phoneE164: ctx.phoneE164,
    leadId: ctx.leadId,
    now: ctx.now,
  });
  await updateReconciliation(ctx.tx, key, {
    optOutToolAt: ctx.now,
    optOutToolPhrase: args.leadPhrase ? args.leadPhrase.slice(0, 300) : null,
  });
  const recorded = await recordCanonicalOptOut(ctx.tx, ctx.locked, {
    lead: ctx.lead,
    organizationId: ctx.binding.organizationId,
    sessionId: ctx.binding.sessionId,
    phoneE164: ctx.phoneE164,
    actor: { type: 'AGENT', id: ctx.binding.agentId },
    source: 'TOOL',
    now: ctx.now,
  });
  const speech = SCHEDULING_SPEECH.OPT_OUT_RECORDED;
  return { status: 'RECORDED', meetingPreserved: recorded.meetingPreserved, speech };
}

export async function recordOptOut(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  args: RecordOptOutArguments,
): Promise<RecordOptOutResult> {
  const result = await withLeadLocks(deps, { scope, lockLead: true }, (ctx) =>
    preventiveOptOut(ctx, args),
  );
  if ('value' in result) return result.value;
  return {
    status: 'REFUSED',
    reason: result.refusal,
    speech: renderRefusalSpeech('CONTEXT_REFUSED'),
  };
}
