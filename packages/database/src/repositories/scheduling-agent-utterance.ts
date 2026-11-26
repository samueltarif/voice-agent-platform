import type { SchedulingAgentScope, SchedulingProtocolView } from '@voice-agent/contracts';
import { decideUtterance } from './scheduling-agent-clarification.js';
import {
  withLockedProtocol,
  type LockedEvent,
  type SchedulingEventDeps,
} from './scheduling-agent-events.js';
import { recordCanonicalOptOut } from './scheduling-agent-opt-out.js';
import { protocolView } from './scheduling-agent-view.js';
import { applyProtocolEvent } from './scheduling-protocol-store.js';

/**
 * E2 PR 3 (DEC-075, D2) — fala FINAL do interlocutor, classificada no
 * servidor. Opt-out reconhecido (pedido inequívoco ou "sim" à pergunta de
 * esclarecimento entregue) é gravado na supressão canônica NA MESMA
 * transação, sem depender do modelo nem do toolset.
 */

async function handleUtterance(event: LockedEvent, text: string) {
  const { tx, locked, now } = event;
  const startedSeq = locked.row.leadSpeechStartedSeq;
  if (startedSeq === null) {
    const step = { state: locked.row.state, directives: [] };
    const view = protocolView({ step, row: locked.row, timezone: null });
    return { view: () => ({ ...view, ignored: 'UTTERANCE_WITHOUT_START' }) };
  }
  const decision = decideUtterance(text, locked.row, startedSeq);
  const questionReset = decision.clearQuestion
    ? { optOutQuestionGeneration: null, optOutQuestionDeliveredSeq: null }
    : {};
  const applied = await applyProtocolEvent(tx, locked, {
    body: { type: 'LEAD_FINAL_UTTERANCE', startedSeq, intent: decision.intent },
    now,
    options: { leadSpeechStartedSeq: null, optOutPending: decision.pending, ...questionReset },
  });
  const optedOut = applied.step.directives.some((directive) => directive.kind === 'RECORD_OPT_OUT');
  const recorded =
    optedOut && decision.recordOptOut
      ? await recordCanonicalOptOut(tx, applied.locked, {
          lead: event.lead,
          organizationId: event.binding.organizationId,
          sessionId: event.binding.sessionId,
          phoneE164: event.phoneE164,
          actor: { type: 'AGENT', id: event.binding.agentId },
          source: decision.recordOptOut,
          now,
        })
      : null;
  const row = recorded?.locked.row ?? applied.locked.row;
  return { view: (timezone: string | null) => protocolView({ step: applied.step, row, timezone }) };
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
