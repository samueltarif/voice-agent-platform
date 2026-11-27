import {
  classifyLeadReply,
  mentionsOptOut,
  prepareReply,
  toMatchForm,
  type LeadReplyIntent,
} from '@voice-agent/contracts';
import type { SchedulingProtocolStateEntity } from '../schema/scheduling-protocol-states.js';
import type { OptOutSource } from './scheduling-agent-opt-out.js';

/**
 * E2 PR 3 (DEC-075, D2) — decisão sobre a fala final do interlocutor,
 * incluindo o esclarecimento de um POSSÍVEL opt-out.
 *
 * - Pedido inequívoco (`OPT_OUT`): grava o opt-out, sem exigência temporal.
 * - Menção não reconhecida como pedido: abre o esclarecimento; nenhuma
 *   intenção comercial avança (vira `AMBIGUOUS`).
 * - Com esclarecimento pendente, só vale resposta que COMEÇOU depois da
 *   entrega completa da pergunta ("você quer que a gente pare de ligar?"):
 *   "sim" (lista fechada `YES_ANSWERS`) ⇒ opt-out; exatamente "não" ⇒ segue,
 *   mas com NOVA lista (o consentimento anterior à pergunta não é reaproveitado).
 * - Qualquer outra resposta mantém o bloqueio e exige perguntar de novo.
 *   Ambiguidade nunca autoriza continuar.
 */

const MAX_UTTERANCE_CHARS = 4_000;
/** Respostas aceitas à pergunta "você quer que a gente pare de ligar?" (lista fechada). */
const YES_ANSWERS = new Set([
  'sim',
  'sim por favor',
  'quero',
  'sim quero',
  'pode parar',
  'sim pode parar',
  'isso',
]);
const CONTINUE_ANSWERS = new Set(['não', 'nao']);

export interface UtteranceDecision {
  readonly intent: LeadReplyIntent;
  readonly pending: boolean;
  readonly recordOptOut: OptOutSource | null;
  /** A pergunta precisa ser falada de novo (resposta inválida ou já usada). */
  readonly clearQuestion: boolean;
}

const AMBIGUOUS: LeadReplyIntent = { kind: 'AMBIGUOUS' };

function classify(text: string): LeadReplyIntent {
  return text.length > MAX_UTTERANCE_CHARS ? AMBIGUOUS : classifyLeadReply(text);
}

/** Forma de comparação da resposta, só se ela estiver na gramática simples (sem símbolos ou aspas). */
function plainAnswer(text: string): string | null {
  const prepared = prepareReply(text);
  return prepared.plainSurface && !prepared.hasInvisibleOrControl
    ? toMatchForm(prepared.text)
    : null;
}

const OPT_OUT_CONFIRMED: UtteranceDecision = {
  intent: { kind: 'OPT_OUT' },
  pending: false,
  recordOptOut: 'CLARIFICATION',
  clearQuestion: true,
};
const RESUME: UtteranceDecision = {
  intent: { kind: 'TIME_CHANGE' },
  pending: false,
  recordOptOut: null,
  clearQuestion: true,
};
const ASK_AGAIN: UtteranceDecision = {
  intent: AMBIGUOUS,
  pending: true,
  recordOptOut: null,
  clearQuestion: true,
};

function answerToQuestion(text: string, intent: LeadReplyIntent): UtteranceDecision {
  const answer = plainAnswer(text);
  if (answer === null) return ASK_AGAIN;
  // "Sim, pode marcar" NÃO é resposta à pergunta de opt-out: só a lista fechada vale.
  if (YES_ANSWERS.has(answer)) return OPT_OUT_CONFIRMED;
  return intent.kind === 'NEGATE' && CONTINUE_ANSWERS.has(answer) ? RESUME : ASK_AGAIN;
}

export function decideUtterance(
  text: string,
  row: SchedulingProtocolStateEntity,
  startedSeq: number,
): UtteranceDecision {
  // A4: fala acima do limite nunca decide pelo prefixo — pendência, sem efeito comercial.
  if (text.length > MAX_UTTERANCE_CHARS) {
    return {
      intent: AMBIGUOUS,
      pending: true,
      recordOptOut: null,
      clearQuestion: row.optOutPending,
    };
  }
  const intent = classify(text);
  if (intent.kind === 'OPT_OUT') {
    return { intent, pending: false, recordOptOut: 'LEAD_UTTERANCE', clearQuestion: true };
  }
  const bounded = text.slice(0, MAX_UTTERANCE_CHARS);
  if (!row.optOutPending) {
    const pending = mentionsOptOut(bounded);
    return {
      intent: pending ? AMBIGUOUS : intent,
      pending,
      recordOptOut: null,
      clearQuestion: false,
    };
  }
  const delivered = row.optOutQuestionDeliveredSeq;
  if (delivered === null || startedSeq <= delivered) {
    return { intent: AMBIGUOUS, pending: true, recordOptOut: null, clearQuestion: false };
  }
  return answerToQuestion(bounded, intent);
}
