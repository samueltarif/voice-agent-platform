import { createHash } from 'node:crypto';
import type { KnowledgeRetrievalPreview, KnowledgeRetrievalResult } from '@voice-agent/contracts';

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * SOMENTE TESTES (caracterização da v1, DEC-067): projeção estável de uma busca.
 * IDs aleatórios ficam de fora; trechos viram hash do texto exato. Empates de
 * relevância/nota/ordinal são ordenados pelo próprio conteúdo (a ordem entre
 * empates usa o ID aleatório do trecho e não é parte do comportamento).
 */
export function projectRetrieval(
  result: KnowledgeRetrievalResult,
  keys: ReadonlyMap<string, string>,
): string {
  const hits = result.hits
    .map((h) =>
      [
        h.relevance ?? '-',
        keys.get(h.documentId) ?? '?',
        h.provenance.chunkOrdinal,
        h.score,
        hash(h.textSnapshot),
      ].join('|'),
    )
    .sort();
  return JSON.stringify({
    hits,
    truncated: result.truncated,
    unmatched: result.unmatchedTerms ?? [],
  });
}

export function projectPreview(
  preview: KnowledgeRetrievalPreview,
  keys: ReadonlyMap<string, string>,
): string {
  const hits = preview.hits
    .map((h) =>
      [
        h.relevance ?? '-',
        keys.get(h.documentId) ?? '?',
        h.chunkOrdinal,
        h.score,
        hash(h.excerpt),
      ].join('|'),
    )
    .sort();
  return JSON.stringify({ terms: preview.terms, hits, unmatched: preview.unmatchedTerms ?? [] });
}
