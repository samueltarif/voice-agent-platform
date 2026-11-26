import { scopeQuotes } from './lead-reply-quotes.js';

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

export { QUOTATION } from './lead-reply-quotes.js';

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

/**
 * Palavra lexical: letra ou dígito, seguida de letras, dígitos e marcas
 * combinantes; `_` é o marcador de citação retirada (`scopeQuotes`) e também
 * conta como palavra, para que uma citação nunca desapareça da cláusula.
 */
const LEXICAL = /_|[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;
/** Alfabeto do português: ASCII e as letras acentuadas da ortografia. */
const PORTUGUESE_WORD = /^[a-z0-9áàâãéêíóôõúüç]+$/u;
/** Marcador de palavra FORA do alfabeto: nunca casa com forma conhecida. */
export const FOREIGN_WORD = '_';

function matchWord(word: string): string {
  const lower = word.normalize('NFC').toLowerCase();
  return PORTUGUESE_WORD.test(lower) ? lower : FOREIGN_WORD;
}

/**
 * Forma de comparação SEM PERDA (3ª e 4ª auditorias, I1/I6): uma palavra de
 * saída por palavra lexical de entrada, em minúsculas e NFC, COM os acentos.
 * Palavra com outro alfabeto, diacrítico estranho ao português ou marca
 * combinante sobrando vira `_`. Nenhum diacrítico é removido aqui: `pôde`
 * continua diferente de `pode`. Pontuação e símbolos não são palavras (já
 * tiram o texto da gramática do aceite em `prepareReply`).
 */
export function toMatchForm(text: string): string {
  return (text.match(LEXICAL) ?? []).map(matchWord).join(' ');
}

/** Letra acentuada → a própria letra OU a letra sem acento (omissão declarada). */
const OMITTABLE: Readonly<Record<string, string>> = {
  á: '[áa]',
  à: '[àa]',
  â: '[âa]',
  ã: '[ãa]',
  é: '[ée]',
  ê: '[êe]',
  í: '[íi]',
  ó: '[óo]',
  ô: '[ôo]',
  õ: '[õo]',
  ú: '[úu]',
  ü: '[üu]',
  ç: '[çc]',
};

/**
 * Padrão de comparação a partir de formas escritas COM a ortografia correta.
 * Variante legítima declarada: a OMISSÃO de um acento da forma permitida
 * (`nao`, `ta bom`, `numero`), comum em transcrição e digitação. Acento
 * trocado ou acrescentado nunca casa (`pôde` ≠ `pode`, `dá lista` ≠ `da lista`).
 * As formas não podem ter letra acentuada dentro de classe `[...]`.
 */
export function lexical(source: string): string {
  return [...source].map((char) => OMITTABLE[char] ?? char).join('');
}

/** Forma(s) como palavras inteiras dentro da cláusula. */
export function wordsPattern(source: string): RegExp {
  return new RegExp(`(?:^| )(?:${lexical(source)})(?= |$)`, 'u');
}

/** A cláusula inteira é exatamente uma das formas. */
export function wholePattern(forms: readonly string[]): RegExp {
  return new RegExp(`^(?:${forms.map(lexical).join('|')})$`, 'u');
}

export interface ReplySentence {
  /** Cláusula na forma de comparação (`?` = interrogação sem palavras). */
  readonly normalized: string;
  /** A frase tem interrogação. */
  readonly question: boolean;
  /** Conteúdo citado, ou fala com aspa sem par: nunca é pedido nem trecho independente. */
  readonly quoted: boolean;
  /** A cláusula foi aberta por conectivo de contraste ("mas não", "só que não"). */
  readonly contrast: boolean;
}

/**
 * Frase: trecho até a pontuação forte, cobrindo TODO o texto (5ª auditoria):
 * uma interrogação isolada ou de abertura ("Me descadastre. ?", "¿…") vira
 * frase própria e nunca é descartada.
 */
const SENTENCE = /[^.!?¿؟⸮‽…\n]*(?:[.!?¿؟⸮‽…\n]+|$)/gu;
const CONTRAST = wordsPattern('mas|porém|só que|entretanto|contudo');
const CLAUSE = new RegExp(CONTRAST.source, 'gu');
/** Marcador de interrogação sem palavras: não casa com nenhuma forma. */
const BARE_QUESTION = '?';

function clausesOfSentence(sentence: string, quoted: boolean): ReplySentence[] {
  const question = QUESTION.test(sentence);
  const clauses = sentence.split(';').flatMap((part) =>
    toMatchForm(part)
      .split(CLAUSE)
      .map((text, index) => ({ normalized: text.trim(), question, quoted, contrast: index > 0 }))
      .filter((clause) => clause.normalized.length > 0),
  );
  if (clauses.length > 0 || !question) return clauses;
  return [{ normalized: BARE_QUESTION, question, quoted, contrast: false }];
}

function clausesOf(text: string, quoted: boolean): ReplySentence[] {
  return (text.match(SENTENCE) ?? []).flatMap((sentence) => clausesOfSentence(sentence, quoted));
}

/**
 * TODAS as cláusulas da fala, sem descartar nenhuma (4ª auditoria A2): o
 * escopo das citações é resolvido antes da segmentação (`scopeQuotes`); o
 * conteúdo citado vira cláusulas `quoted`; aspa sem par marca todas como
 * `quoted`. Quem decide é a fala inteira (`lead-reply-intent.ts`).
 */
export function splitSentences(text: string): ReplySentence[] {
  const visible = text.replace(new RegExp(INVISIBLE_OR_CONTROL.source, 'gu'), '');
  const scope = scopeQuotes(visible);
  return [
    ...clausesOf(scope.own, scope.unbalanced),
    ...scope.quoted.flatMap((quote) => clausesOf(quote, true)),
  ];
}
