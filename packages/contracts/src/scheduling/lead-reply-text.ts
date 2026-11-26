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
  if (!PORTUGUESE_WORD.test(lower)) return FOREIGN_WORD;
  return lower.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Forma de comparação (3ª auditoria A1, invariante I1): uma palavra de saída
 * por palavra lexical de entrada. Acentos do português são removidos; qualquer
 * palavra com outro alfabeto, diacrítico estranho ao português ou marca
 * combinante sobrando vira `_` — nunca desaparece. Pontuação e símbolos não
 * são palavras (já tiram o texto da gramática do aceite em `prepareReply`).
 */
export function toMatchForm(text: string): string {
  return (text.match(LEXICAL) ?? []).map(matchWord).join(' ');
}

export interface ReplySentence {
  /** Cláusula na forma de comparação. */
  readonly normalized: string;
  /** A frase termina em interrogação. */
  readonly question: boolean;
  /** Conteúdo citado, ou fala com aspa sem par: nunca é pedido. */
  readonly quoted: boolean;
  /** As OUTRAS cláusulas da mesma frase (para restrições posteriores ou anteriores). */
  readonly siblings: readonly string[];
}

/** Frase: termina em pontuação forte. `;` e conectivos de contraste só separam cláusulas. */
const SENTENCE = /[^.!?¿؟⸮‽…\n]+[.!?¿؟⸮‽…\n]*/gu;
const CLAUSE = /;|\b(?:mas|porem|so que|entretanto|contudo)\b/;
const STARTS_WITH_CONTRAST = /^(?:mas|porem|so que|entretanto|contudo)\b/;

interface Group {
  readonly clauses: string[];
  question: boolean;
}

/** Frases; uma frase que começa por contraste ("Mas só se…") continua a anterior (I3). */
function groupSentences(own: string): Group[] {
  const groups: Group[] = [];
  for (const sentence of own.match(SENTENCE) ?? []) {
    const clauses = sentence
      .split(';')
      .flatMap((part) => toMatchForm(part).split(CLAUSE))
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const previous = groups[groups.length - 1];
    if (previous && clauses.length > 0 && STARTS_WITH_CONTRAST.test(toMatchForm(sentence))) {
      previous.clauses.push(...clauses);
      previous.question ||= QUESTION.test(sentence);
    } else groups.push({ clauses, question: QUESTION.test(sentence) });
  }
  return groups;
}

function clausesOf(group: Group, quoted: boolean): ReplySentence[] {
  return group.clauses.map((normalized, index) => ({
    normalized,
    question: group.question,
    quoted,
    siblings: group.clauses.filter((_, other) => other !== index),
  }));
}

/**
 * Cláusulas da fala (3ª auditoria A2): o escopo das citações é resolvido ANTES
 * da segmentação (`scopeQuotes`); o conteúdo citado vira cláusulas `quoted`
 * (só menção). Aspa sem par marca TODAS as cláusulas como `quoted`.
 * Invisíveis são removidos aqui; a decisão de aceite já os considerou.
 */
export function splitSentences(text: string): ReplySentence[] {
  const visible = text.replace(new RegExp(INVISIBLE_OR_CONTROL.source, 'gu'), '');
  const scope = scopeQuotes(visible);
  const own = groupSentences(scope.own).flatMap((group) => clausesOf(group, scope.unbalanced));
  const cited = scope.quoted.flatMap((quote) =>
    groupSentences(quote).flatMap((group) => clausesOf(group, true)),
  );
  return [...own, ...cited];
}
