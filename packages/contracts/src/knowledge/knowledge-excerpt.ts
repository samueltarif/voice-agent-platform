/**
 * Normalização de texto e recorte de trechos da Base de Conhecimento.
 * Puro e determinístico; compartilhado pela busca (banco), pela pré-visualização
 * (API) e pelo futuro envelope de voz. O texto é DADO não confiável.
 */

const COMBINING_MARKS = /\p{M}/gu;

function foldChar(ch: string): string {
  return ch.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/** Minúsculas e sem acentos ("Pressão" → "pressao"). */
export function foldKnowledgeText(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

interface FoldedIndex {
  readonly folded: string;
  /** Para cada posição do texto normalizado, a posição no texto original. */
  readonly originalIndex: readonly number[];
}

function indexFolded(text: string): FoldedIndex {
  let folded = '';
  const originalIndex: number[] = [];
  let offset = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    for (let i = 0; i < f.length; i++) originalIndex.push(offset);
    folded += f;
    offset += ch.length;
  }
  return { folded, originalIndex };
}

function snapStart(text: string, start: number): number {
  if (start <= 0) return 0;
  const space = text.indexOf(' ', start);
  return space === -1 || space - start > 40 ? start : space + 1;
}

/**
 * Recorta até `maxChars` em volta da primeira ocorrência do termo de maior
 * prioridade (a ordem de `terms` é a prioridade). Sem ocorrência: início do texto.
 * Marca com "…" o que foi cortado, para não parecer o documento inteiro.
 */
export function buildKnowledgeExcerpt(
  text: string,
  terms: readonly string[],
  maxChars: number,
): string {
  if (text.length <= maxChars) return text;
  const { folded, originalIndex } = indexFolded(text);
  const hit = terms.map((t) => folded.indexOf(t)).find((pos) => pos >= 0);
  const anchor = hit === undefined ? 0 : (originalIndex[hit] ?? 0);
  const start = snapStart(text, Math.max(0, anchor - Math.floor(maxChars / 4)));
  const end = Math.min(text.length, start + maxChars);
  const body = text.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}
