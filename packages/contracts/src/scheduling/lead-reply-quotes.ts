/**
 * E2 PR 1 (DEC-075, 3ª auditoria A2) — escopo de citação ANTES da segmentação.
 *
 * Causa corrigida: a citação era detectada por frase, depois de dividir o
 * texto pela pontuação; uma citação com várias frases (“Hoje não posso. Não me
 * ligue mais. Obrigada.”) perdia as aspas nas frases internas. Agora o texto
 * inteiro é percorrido primeiro e cada trecho entre aspas pareadas é retirado
 * do texto PRÓPRIO do falante (substituído por `_`); seu conteúdo só pode ser
 * MENÇÃO. Pontuação interna à citação nunca cria frase própria.
 *
 * Conservador, não um analisador: qualquer aspa sem par, fechamento sem
 * abertura, aspa desconhecida ou apóstrofo isolado torna a fala inteira
 * `unbalanced` — nenhuma parte dela pode ser pedido de opt-out.
 */

/** Abertura → fechamento esperado. Os simétricos abrem e fecham com o mesmo sinal. */
const PAIRS: Readonly<Record<string, string>> = {
  '“': '”',
  '„': '“',
  '‘': '’',
  '‚': '‘',
  '«': '»',
  '‹': '›',
  '「': '」',
  '『': '』',
  '〝': '〞',
  '"': '"',
  "'": "'",
  '`': '`',
  '´': '´',
};

/** Qualquer sinal de citação, inclusive os que não abrem nada nesta tabela. */
export const QUOTATION = /["'`´“”„‟‘’‚‛«»‹›「」『』〝〞〟]|\p{Pi}|\p{Pf}/u;

export interface QuoteScope {
  /** Texto do próprio falante, com cada citação substituída por ` _ `. */
  readonly own: string;
  /** Conteúdo das citações balanceadas (só pode ser menção). */
  readonly quoted: readonly string[];
  /** Alguma aspa sem par: nenhuma parte da fala pode ser pedido. */
  readonly unbalanced: boolean;
}

interface ScanState {
  own: string;
  current: string;
  quoted: string[];
  stack: string[];
  unbalanced: boolean;
}

function step(state: ScanState, char: string): void {
  const top = state.stack[state.stack.length - 1];
  if (top !== undefined && char === PAIRS[top]) {
    state.stack.pop();
    if (state.stack.length === 0) {
      state.quoted.push(state.current);
      state.current = '';
      state.own += ' _ ';
    }
  } else if (PAIRS[char] !== undefined) {
    state.stack.push(char);
  } else if (QUOTATION.test(char)) {
    state.unbalanced = true;
  } else if (state.stack.length > 0) {
    state.current += char;
  } else {
    state.own += char;
  }
}

export function scopeQuotes(text: string): QuoteScope {
  const state: ScanState = { own: '', current: '', quoted: [], stack: [], unbalanced: false };
  for (const char of text) step(state, char);
  if (state.stack.length > 0) {
    state.quoted.push(state.current);
    state.unbalanced = true;
  }
  return { own: state.own, quoted: state.quoted, unbalanced: state.unbalanced };
}
