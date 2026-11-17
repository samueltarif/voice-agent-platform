import type { CandidateChunk } from './knowledge-retrieval-v2-queries.js';
import { foldKnowledgeText } from './knowledge-query-terms.js';
import { countTerm, type CompiledTerm } from './knowledge-term-matcher-v2.js';
import { KNOWLEDGE_GENERIC_TERMS } from './knowledge-term-relevance.js';

/**
 * Busca v2 (DEC-067): depois do pré-filtro SQL (superconjunto), confere o
 * casamento EXATO de cada termo em memória, calcula a frequência de cada termo
 * entre os trechos (IDF, sem nova varredura do escopo) e mantém só os trechos
 * mais promissores para costurar vizinhos e dividir em passagens.
 * `V2_PASSAGE_CHUNK_LIMIT` é bem maior que o topK máximo (10).
 */
export const V2_PASSAGE_CHUNK_LIMIT = 50;

interface Matched {
  readonly row: CandidateChunk;
  readonly counts: readonly number[];
}

function chunkScore(m: Matched, terms: readonly CompiledTerm[], idf: readonly number[]): number {
  return m.counts.reduce((sum, tf, i) => {
    if (tf === 0) return sum;
    const weight = terms[i]!.isCode || !KNOWLEDGE_GENERIC_TERMS.has(terms[i]!.term) ? 1 : 0.5;
    return sum + weight * idf[i]! * (tf / (tf + 1.2));
  }, 0);
}

export interface Preselection {
  readonly rows: readonly CandidateChunk[];
  /** Trechos (entre os candidatos) com casamento exato de cada termo. */
  readonly documentFrequency: readonly number[];
}

export function preselectChunksV2(
  candidates: readonly CandidateChunk[],
  terms: readonly CompiledTerm[],
  total: number,
): Preselection {
  const matched: Matched[] = candidates
    .map((row) => {
      const folded = foldKnowledgeText(row.text);
      return { row, counts: terms.map((t) => countTerm(folded, t)) };
    })
    .filter((m) => m.counts.some((c) => c > 0));
  const df = terms.map((_, i) => matched.filter((m) => m.counts[i]! > 0).length);
  const idf = df.map((d) => Math.log(1 + Math.max(1, total) / Math.max(1, d)));
  const ranked = matched
    .map((m) => ({ m, score: chunkScore(m, terms, idf) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.m.row.documentId.localeCompare(b.m.row.documentId) ||
        a.m.row.ordinal - b.m.row.ordinal,
    );
  return {
    rows: ranked.slice(0, V2_PASSAGE_CHUNK_LIMIT).map((r) => r.m.row),
    documentFrequency: df,
  };
}
