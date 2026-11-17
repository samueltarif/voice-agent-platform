import {
  type KnowledgeAccessScope,
  type KnowledgeRetrievalQuery,
  type KnowledgeRetrievalResult,
  KNOWLEDGE_RETRIEVAL_MAX_TOP_K,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { analyzeKnowledgeQueryV2 } from './knowledge-query-analysis-v2.js';
import { extractKnowledgeQueryTerms } from './knowledge-query-terms.js';
import { evaluatePassagesV2 } from './knowledge-passage-evaluation-v2.js';
import {
  loadCandidates,
  loadNeighbors,
  loadOrganizationName,
  loadScopeStats,
  V2_MAX_CANDIDATES,
  type ChunkRow,
} from './knowledge-retrieval-v2-queries.js';

/** Vizinhos (ordinal ± 1) que ainda não estão entre os candidatos. */
function missingNeighbors(rows: readonly ChunkRow[]) {
  const have = new Set(rows.map((r) => `${r.doc.id}:${r.chunk.ordinal}`));
  const wanted = new Map<string, { documentId: string; ordinal: number }>();
  for (const { doc, chunk } of rows) {
    for (const ordinal of [chunk.ordinal - 1, chunk.ordinal + 1]) {
      const key = `${doc.id}:${ordinal}`;
      if (ordinal >= 0 && !have.has(key)) wanted.set(key, { documentId: doc.id, ordinal });
    }
  }
  return [...wanted.values()].slice(0, V2_MAX_CANDIDATES);
}

/**
 * Busca v2 (DEC-067), OPT-IN: só roda com `retrievalProfile: 'v2'` explícito.
 * Mesmo escopo da v1 (organização, documentos prontos, agente, versão,
 * coleção e filtros), passagens em vez de trechos inteiros, códigos de
 * produto, âncora e aspectos comerciais. Nada é gravado.
 */
export async function retrieveKnowledgeV2(
  db: DatabaseInstance,
  scope: KnowledgeAccessScope,
  query: KnowledgeRetrievalQuery,
): Promise<KnowledgeRetrievalResult> {
  const analysis = analyzeKnowledgeQueryV2(query.queryText);
  const input = { scope, query, words: analysis.words, codes: analysis.codes };
  const candidates = await loadCandidates(db, input);
  const capped = candidates.length > V2_MAX_CANDIDATES;
  const rows = candidates.slice(0, V2_MAX_CANDIDATES);
  const neighbors = await loadNeighbors(db, input, missingNeighbors(rows));
  const stats = await loadScopeStats(db, input);
  const orgName = await loadOrganizationName(db, scope.organizationId);
  const evaluated = evaluatePassagesV2({
    rows: [...rows, ...neighbors],
    words: analysis.words,
    codes: analysis.codes,
    aspects: analysis.aspects,
    organizationNameTerms: new Set(orgName ? extractKnowledgeQueryTerms(orgName) : []),
    scope: stats,
  });
  const topK = Math.min(Math.max(1, query.topK ?? 5), KNOWLEDGE_RETRIEVAL_MAX_TOP_K);
  return {
    hits: evaluated.hits.slice(0, topK),
    truncated: capped || evaluated.hits.length > topK,
    unmatchedTerms: evaluated.unmatchedTerms,
    aspectsNotFound: evaluated.aspectsNotFound,
  };
}
