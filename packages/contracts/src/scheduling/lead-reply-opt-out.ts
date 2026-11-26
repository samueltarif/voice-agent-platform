/**
 * E2 PR 1 (DEC-075, auditoria A2) — reconhecimento de opt-out POR CLÁUSULA.
 *
 * - Pedido = forma explícita (lista fechada) numa cláusula SEM negação do
 *   próprio pedido ("não precisa tirar…"), FORA de aspas e, se for pergunta,
 *   formulada como pedido ("Pode tirar meu número?", "Vocês podem parar de me
 *   ligar?"). Pergunta informativa ("O que significa descadastrar?") não é.
 * - Menção (citação, negação, pergunta informativa, palavra solta) não é
 *   pedido, mas também não é aceite: a resposta inteira vira `AMBIGUOUS`.
 * - Um pedido explícito em qualquer cláusula prevalece sobre o resto.
 * Situações não reconhecidas ficam seguras: viram esclarecimento, nunca aceite.
 */

export interface ReplyClause {
  readonly normalized: string;
  readonly question: boolean;
  /** Conteúdo entre aspas: citação, nunca pedido. */
  readonly quoted: boolean;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const OPT_OUT_REQUESTS: readonly RegExp[] = [
  /\bnao (me )?(ligue|liguem|ligam|liga|ligar) mais\b/,
  /\bpar(a|e|em|ar) de (me )?ligar\b/,
  /\b(tira|tire|tirar|retira|retire|retirar|remove|remova|remover|exclui|exclua|excluir|apaga|apague|apagar) (o )?meu (numero|telefone|contato)\b/,
  /\bnao quero (mais )?receber (ligacao|ligacoes|chamada|chamadas)\b/,
  /\bme descadastr(a|e|ar|em)\b/,
  /\bdescadastr(a|e|ar|em) (o )?meu (numero|telefone|contato)\b/,
  /\bquero (ser )?descadastrad[oa]\b/,
  /\bme (tira|tire|tirar|retira|retire|retirar|remove|remova|remover|exclui|exclua|excluir) da (sua |de |dessa |desta )?lista\b/,
];

/** Negação do próprio pedido, na MESMA cláusula. */
const NEGATED_REQUEST = /\bnao (precisa|precisam|e para|e pra|quero que|pedi|pedimos|solicitei)\b/;

/** Pergunta que é, ela mesma, um pedido. */
const INTERROGATIVE_REQUEST =
  /^(por favor )?((voce|voces|o senhor|a senhora) )?(pode|podem|poderia|poderiam|da pra|tem como|consegue|conseguem)\b/;

const QUOTED_SPAN = /["“«„‘][^"“”«»„‘’]*["”»’]/g;
const STRAY_QUOTE = /["“”«»„‘’]/;

function clausesOf(text: string, quoted: boolean): ReplyClause[] {
  const pieces = text.match(/[^.;!?,\n]+[.;!?,\n]*/g) ?? [];
  return pieces.flatMap((piece) => {
    const question = /[?]/.test(piece) || /¿/.test(piece);
    return normalize(piece)
      .split(/\bmas\b/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((normalized) => ({ normalized, question, quoted }));
  });
}

/** Separa citações (aspas balanceadas) das cláusulas próprias do interlocutor. */
export function splitClauses(text: string): ReplyClause[] {
  const quotes = text.match(QUOTED_SPAN) ?? [];
  const own = text.replace(QUOTED_SPAN, ' ');
  // Aspa sem par: não dá para saber o que é citação; tudo vira citação.
  if (STRAY_QUOTE.test(own)) return clausesOf(text, true);
  return [...clausesOf(own, false), ...quotes.flatMap((quote) => clausesOf(quote, true))];
}

const hasRequestForm = (normalized: string) =>
  OPT_OUT_REQUESTS.some((pattern) => pattern.test(normalized));

export function isOptOutRequest(clause: ReplyClause): boolean {
  if (clause.quoted || !hasRequestForm(clause.normalized)) return false;
  if (NEGATED_REQUEST.test(clause.normalized)) return false;
  return !clause.question || INTERROGATIVE_REQUEST.test(clause.normalized);
}

/** Qualquer referência a opt-out que NÃO é pedido: leva a esclarecimento. */
export function isOptOutMention(clause: ReplyClause): boolean {
  return hasRequestForm(clause.normalized) || /descadastr/.test(clause.normalized);
}
