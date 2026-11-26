import { COURTESY, INDEPENDENT_FORMS, LEAD_INS, MODALS, TAILS } from './lead-reply-lexicon.js';
import { type ReplySentence, lexical, wholePattern, wordsPattern } from './lead-reply-text.js';

/**
 * E2 PR 1 (DEC-075, 4ª auditoria A2) — gramática FECHADA do opt-out.
 *
 * A fala inteira decide (`lead-reply-intent.ts`): cada cláusula precisa ser
 * reconhecida como PEDIDO ATUAL ou como TRECHO INDEPENDENTE conhecido; uma
 * única cláusula desconhecida (condição, ressalva, hipótese, citação) em
 * qualquer posição tira a fala do opt-out e leva a esclarecimento. Não há
 * lista de palavras proibidas: o que não está na gramática não autoriza nada.
 *
 * PEDIDO ATUAL, na mesma cláusula:
 * - uma forma explícita (lista fechada `FORMS`);
 * - antes dela, só cortesia, interpelação, modal de pedido ou conectivo
 *   simples (`LEAD_INS`); depois, só complementos permitidos (`TAILS`);
 * - em pergunta, um modal de pedido ("pode", "poderia", "tem como"…);
 * - fora de citação e sem aspa sem par na fala.
 * As formas são escritas com a ortografia correta; a omissão de acento é a
 * única variante aceita (`lexical`).
 */

const FORMS: readonly RegExp[] = [
  'não (?:me )?(?:ligue|liguem|ligam|liga|ligar) mais',
  '(?:para|pare|parem|parar) de (?:me )?ligar',
  '(?:tira|tire|tirar|retira|retire|retirar|remove|remova|remover|exclui|exclua|excluir|apaga|apague|apagar) (?:o )?meu (?:número|telefone|contato)',
  'não quero (?:mais )?receber (?:ligação|ligações|chamada|chamadas)',
  'me descadastr(?:a|e|ar|em)',
  'descadastr(?:a|e|ar|em) (?:o )?meu (?:número|telefone|contato)',
  'quero (?:ser )?descadastrad(?:o|a)',
  'me (?:tira|tire|tirar|retira|retire|retirar|remove|remova|remover|exclui|exclua|excluir) da (?:sua |de |dessa |desta )?lista',
].map(wordsPattern);

const INDEPENDENT = wholePattern(INDEPENDENT_FORMS);

const sequenceOf = (items: readonly string[]) =>
  new RegExp(
    `^(?:(?:${[...items]
      .sort((a, b) => b.length - a.length)
      .map(lexical)
      .join('|')})(?: |$))*$`,
    'u',
  );

const PREFIX_OK = sequenceOf(LEAD_INS);
const TAIL_OK = sequenceOf(TAILS);
const COURTESY_ONLY = sequenceOf(COURTESY);
const AFTER_REQUEST_COURTESY = sequenceOf(COURTESY.filter((item) => !item.startsWith('não')));
const MODAL = wordsPattern(MODALS.join('|'));

function isCurrentRequest(clause: ReplySentence, form: RegExp): boolean {
  const match = form.exec(clause.normalized);
  if (!match) return false;
  const prefix = clause.normalized.slice(0, match.index).trim();
  const tail = clause.normalized.slice(match.index + match[0].length).trim();
  if (!PREFIX_OK.test(prefix) || !TAIL_OK.test(tail)) return false;
  return !clause.question || MODAL.test(prefix);
}

/** A cláusula, sozinha, é um pedido atual de opt-out. */
export function isOptOutRequest(clause: ReplySentence): boolean {
  return !clause.quoted && FORMS.some((form) => isCurrentRequest(clause, form));
}

/**
 * Cortesia ou trecho independente completo da lista fechada (nunca citação).
 * Depois do pedido, cortesias negativas ("não, obrigado") podem ser
 * retratação e não acompanham o pedido (5ª auditoria, N1).
 */
export function isIndependentClause(clause: ReplySentence, beforeRequest: boolean): boolean {
  if (clause.quoted) return false;
  const courtesy = beforeRequest ? COURTESY_ONLY : AFTER_REQUEST_COURTESY;
  return courtesy.test(clause.normalized) || INDEPENDENT.test(clause.normalized);
}

const DESCADASTRO = wordsPattern('descadastr\\S*');

/** Qualquer referência a opt-out que NÃO é pedido atual: leva a esclarecimento. */
export function isOptOutMention(clause: ReplySentence): boolean {
  return FORMS.some((form) => form.test(clause.normalized)) || DESCADASTRO.test(clause.normalized);
}
