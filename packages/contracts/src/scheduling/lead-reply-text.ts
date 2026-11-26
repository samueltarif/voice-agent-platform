/**
 * E2 PR 1 (DEC-075, 2ª auditoria A1/A2) — preparação do texto da fala final.
 *
 * Causa estrutural corrigida: a decisão era tomada DEPOIS de apagar toda a
 * pontuação, e a detecção de pergunta/citação era uma lista de bloqueio de
 * caracteres. Agora:
 * 1. NFKC unifica variantes de compatibilidade (ex.: `？` → `?`, `Ｓｉｍ` → `Sim`);
 * 2. caracteres invisíveis, de formatação ou de controle são DETECTADOS antes
 *    de qualquer limpeza (impedem aceite);
 * 3. o aceite só é avaliado se o texto inteiro obedece a uma GRAMÁTICA DE
 *    PERMISSÃO: palavras (letras/dígitos), vírgula entre palavras e pontuação
 *    terminal `.`/`!`. Qualquer outro sinal — aspas de qualquer tipo,
 *    interrogação de qualquer tipo, símbolos — deixa o texto fora do aceite;
 * 4. só então o texto é reduzido à forma de comparação.
 */

/** Formatação invisível, uso privado, não atribuído e controle (exceto espaços comuns). */
const INVISIBLE_OR_CONTROL = /[\p{Cf}\p{Co}\p{Cn}]|(?![\t\n\r])\p{Cc}/u;

/** Gramática de permissão do aceite: `Sim`, `Sim, pode marcar.`, `Isso mesmo!`. */
const PLAIN_SURFACE = /^[\p{L}\p{N}]+(?:,? [\p{L}\p{N}]+)*(?: ?[.!]+)?$/u;

/** Aspas e delimitadores de citação (inclui apóstrofos e iniciais/finais Unicode). */
export const QUOTATION = /["'`´“”„‟‘’‚‛«»‹›「」『』〝〞〟]|\p{Pi}|\p{Pf}/u;

/** Interrogação em qualquer forma conhecida (após NFKC). */
export const QUESTION = /[?¿؟⸮‽]/u;

export interface PreparedReply {
  /** Texto NFKC, sem alterações além disso. */
  readonly text: string;
  readonly hasInvisibleOrControl: boolean;
  /** Texto apto a ser avaliado como aceite/recusa/escolha. */
  readonly plainSurface: boolean;
}

export function prepareReply(raw: string): PreparedReply {
  const text = raw.normalize('NFKC');
  const hasInvisibleOrControl = INVISIBLE_OR_CONTROL.test(text);
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return {
    text,
    hasInvisibleOrControl,
    plainSurface: !hasInvisibleOrControl && PLAIN_SURFACE.test(collapsed),
  };
}

/** Forma de comparação: minúsculas, sem acentos, sem pontuação, espaços únicos. */
export function toMatchForm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ReplySentence {
  /** Cláusula na forma de comparação. */
  readonly normalized: string;
  /** A frase termina em interrogação. */
  readonly question: boolean;
  /** A frase contém qualquer aspa: o que estiver nela é citação, nunca pedido. */
  readonly quoted: boolean;
}

const SENTENCE = /[^.!?¿؟⸮‽;…\n]+[.!?¿؟⸮‽;…\n]*/gu;
/** Só conectivos de CONTRASTE separam cláusulas; vírgula NÃO é fronteira. */
const CONTRAST = /\b(?:mas|porem|so que|entretanto|contudo)\b/;

/**
 * Frases (por pontuação terminal) e, dentro delas, cláusulas separadas só por
 * conectivo de contraste. Invisíveis são removidos aqui (para o opt-out, que
 * é protetivo); a decisão de aceite já os considerou em `prepareReply`.
 */
export function splitSentences(text: string): ReplySentence[] {
  const visible = text.replace(new RegExp(INVISIBLE_OR_CONTROL.source, 'gu'), '');
  return (visible.match(SENTENCE) ?? []).flatMap((sentence) => {
    const question = QUESTION.test(sentence);
    const quoted = QUOTATION.test(sentence);
    return toMatchForm(sentence)
      .split(CONTRAST)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((normalized) => ({ normalized, question, quoted }));
  });
}
