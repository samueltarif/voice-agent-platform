import type { ReplySentence } from './lead-reply-text.js';

/**
 * E2 PR 1 (DEC-075, 2ª auditoria A2) — reconhecimento de opt-out com ESCOPO.
 *
 * Causa estrutural corrigida: a vírgula era tratada como fronteira semântica,
 * separando "caso precise", "se eu mudar de ideia" ou "por favor" do pedido.
 * Agora a unidade é a frase (pontuação terminal), dividida só por conectivo de
 * contraste ("mas", "porém"…), e um PEDIDO ATUAL exige, na mesma cláusula:
 * - uma forma explícita de pedido (lista fechada);
 * - antes dela, SÓ elementos permitidos (cortesia, interpelação, modal de
 *   pedido, conectivo simples). Qualquer outra coisa — "como faço para", "se
 *   eu mudar de ideia, vou pedir para", "meu sócio disse para", "não precisa" —
 *   tira o pedido do escopo atual;
 * - depois dela, SÓ complementos permitidos ("da lista", "por favor"…);
 *   "caso precise", "amanhã", "se…" ficam fora;
 * - em pergunta, um modal de pedido ("pode", "poderia", "tem como"…);
 * - nenhuma aspa na frase (citação nunca é pedido).
 * Menções não reconhecidas como pedido viram esclarecimento, nunca aceite.
 */

const FORMS: readonly RegExp[] = [
  /\bnao (?:me )?(?:ligue|liguem|ligam|liga|ligar) mais\b/,
  /\b(?:para|pare|parem|parar) de (?:me )?ligar\b/,
  /\b(?:tira|tire|tirar|retira|retire|retirar|remove|remova|remover|exclui|exclua|excluir|apaga|apague|apagar) (?:o )?meu (?:numero|telefone|contato)\b/,
  /\bnao quero (?:mais )?receber (?:ligacao|ligacoes|chamada|chamadas)\b/,
  /\bme descadastr(?:a|e|ar|em)\b/,
  /\bdescadastr(?:a|e|ar|em) (?:o )?meu (?:numero|telefone|contato)\b/,
  /\bquero (?:ser )?descadastrad[oa]\b/,
  /\bme (?:tira|tire|tirar|retira|retire|retirar|remove|remova|remover|exclui|exclua|excluir) da (?:sua |de |dessa |desta )?lista\b/,
];

const MODALS = [
  'pode',
  'podem',
  'poderia',
  'poderiam',
  'da pra',
  'tem como',
  'consegue',
  'conseguem',
];

const LEAD_INS = [
  ...MODALS,
  'por favor',
  'pfv',
  'favor',
  'obrigado',
  'obrigada',
  'obrigado pela ligacao',
  'obrigada pela ligacao',
  'olha',
  'escuta',
  'oi',
  'ola',
  'ah',
  'bom dia',
  'boa tarde',
  'boa noite',
  'entao',
  'e',
  'agora',
  'depois',
  'ja',
  'sim',
  'nao obrigado',
  'nao obrigada',
  'moco',
  'moca',
  'senhor',
  'senhora',
  'o senhor',
  'a senhora',
  'voce',
  'voces',
  'quero que',
  'eu quero que',
  'preciso que',
  'gostaria que',
  'eu gostaria que',
  'quero',
  'eu quero',
  'gostaria de',
  'eu gostaria de',
  'preciso',
];

const TAILS = [
  'da lista',
  'de lista',
  'dessa lista',
  'desta lista',
  'da sua lista',
  'na lista',
  'do cadastro',
  'do seu cadastro',
  'dos contatos',
  'por favor',
  'obrigado',
  'obrigada',
  'agora',
  'ja',
  'de vez',
  'mais',
  'nunca mais',
  'para mim',
  'pra mim',
  'de voces',
  'daqui pra frente',
  'tambem',
];

const sequenceOf = (items: readonly string[]) =>
  new RegExp(`^(?:(?:${[...items].sort((a, b) => b.length - a.length).join('|')})(?: |$))*$`);

const PREFIX_OK = sequenceOf(LEAD_INS);
const TAIL_OK = sequenceOf(TAILS);
const MODAL = new RegExp(`(?:^| )(?:${MODALS.join('|')})(?: |$)`);

function isCurrentRequest(clause: ReplySentence, form: RegExp): boolean {
  const match = form.exec(clause.normalized);
  if (!match) return false;
  const prefix = clause.normalized.slice(0, match.index).trim();
  const tail = clause.normalized.slice(match.index + match[0].length).trim();
  if (!PREFIX_OK.test(prefix) || !TAIL_OK.test(tail)) return false;
  return !clause.question || MODAL.test(prefix);
}

export function isOptOutRequest(clause: ReplySentence): boolean {
  return !clause.quoted && FORMS.some((form) => isCurrentRequest(clause, form));
}

/** Qualquer referência a opt-out que NÃO é pedido atual: leva a esclarecimento. */
export function isOptOutMention(clause: ReplySentence): boolean {
  return FORMS.some((form) => form.test(clause.normalized)) || /descadastr/.test(clause.normalized);
}
