/**
 * Casamento de termos da busca v2 (DEC-067) sobre texto já normalizado
 * (`foldKnowledgeText`): palavras casam no INÍCIO de uma palavra ("transmissor"
 * casa com "transmissores", não com "retransmissor"); números casam inteiros
 * ("310" não casa com "3100"); códigos aceitam separador entre letras e números
 * ("qt310" casa com "QT-310", "QT 310" e "qt310", mas não com "QT-3100").
 */
const BEFORE = '(?<![\\p{L}\\p{N}])';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function codePattern(code: string): string {
  const groups = code.match(/\p{L}+|\p{N}+/gu) ?? [code];
  return `${BEFORE}${groups.map(escape).join('[\\s\\-./]?')}(?![\\p{L}\\p{N}])`;
}

function wordPattern(word: string): string {
  const end = /^\p{N}+$/u.test(word) ? '(?!\\p{N})' : '';
  return `${BEFORE}${escape(word)}${end}`;
}

export interface CompiledTerm {
  readonly term: string;
  readonly isCode: boolean;
  readonly pattern: RegExp;
}

export function compileTerms(words: readonly string[], codes: readonly string[]): CompiledTerm[] {
  return [
    ...codes.map((term) => ({ term, isCode: true, pattern: new RegExp(codePattern(term), 'gu') })),
    ...words.map((term) => ({ term, isCode: false, pattern: new RegExp(wordPattern(term), 'gu') })),
  ];
}

/** Ocorrências do termo no texto normalizado. */
export function countTerm(foldedText: string, term: CompiledTerm): number {
  term.pattern.lastIndex = 0;
  return foldedText.match(term.pattern)?.length ?? 0;
}

/** Posições de início das ocorrências (para proximidade). */
export function termPositions(foldedText: string, term: CompiledTerm): number[] {
  return [...foldedText.matchAll(term.pattern)].map((m) => m.index ?? 0);
}
