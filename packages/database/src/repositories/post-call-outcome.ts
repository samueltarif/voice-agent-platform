import { applyLeadStatusChange, lockLead } from './lead-status-writer.js';
import { reportCurrent, type EffectInput, type EffectsDeps } from './post-call-effects.js';

/**
 * Auditoria #184 A7 — resultado comercial PROPOSTO pela ferramenta, diante do
 * histórico: `CONTACTED` com interlocução (L → R, relatório vigente);
 * `NOT_INTERESTED`/`QUALIFIED` exigem evidência que o histórico textual não
 * dá ⇒ revisão; suspenso com possível opt-out ou histórico incompleto; sem
 * lead, com opt-out ou sem interlocução, ignorado.
 */

export interface OutcomeEffect {
  readonly applied: string | null;
  readonly review: string | null;
}

/** A7 — nenhum resultado sem lead ou com opt-out; suspenso com evidência incerta. */
function outcomeBlocked(input: EffectInput): 'SKIP' | 'OUTCOME_SUSPENDED' | null {
  const { step, evaluation } = input;
  if (!step.proposedOutcome || !step.leadId) return 'SKIP';
  if (step.optOutByTool || evaluation.optOut === 'REQUESTED') return 'SKIP';
  if (evaluation.optOut === 'MENTIONED' || !evaluation.complete) return 'OUTCOME_SUSPENDED';
  return null;
}

/** A7 — o que a evidência do histórico permite fazer com o resultado proposto. */
function outcomeDecision(input: EffectInput): 'APPLY' | 'SKIP' | string {
  const blocked = outcomeBlocked(input);
  if (blocked) return blocked;
  if (!input.evaluation.interlocution) return 'SKIP';
  const proposed = input.step.proposedOutcome;
  return proposed === 'CONTACTED' ? 'APPLY' : `OUTCOME_NEEDS_EVIDENCE:${proposed}`;
}

/** Aplica só `CONTACTED` com interlocução (L → R); o resto vai para revisão ou é ignorado. */
export async function applyPostCallOutcome(
  deps: EffectsDeps,
  input: EffectInput,
): Promise<OutcomeEffect> {
  const decision = outcomeDecision(input);
  if (decision === 'SKIP') return { applied: null, review: null };
  if (decision !== 'APPLY') return { applied: null, review: decision };
  const { step, attempt } = input;
  return deps.db.transaction(async (tx) => {
    const lead = await lockLead(tx, attempt.organizationId, step.leadId!);
    if (!lead || !(await reportCurrent(tx, step))) return { applied: null, review: null };
    const changed = await applyLeadStatusChange(tx, {
      lead,
      to: 'CONTACTED',
      origin: 'CALL_OUTCOME',
      actor: { type: 'AGENT', id: attempt.agentId },
    });
    const applied = changed.kind === 'CHANGED' || changed.reason === 'SAME_STATUS';
    return { applied: applied ? 'CONTACTED' : null, review: null };
  });
}
