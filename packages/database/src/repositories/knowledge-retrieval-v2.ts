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
import { preselectChunksV2 } from './knowledge-chunk-preselection-v2.js';
import { compileTerms } from './knowledge-term-matcher-v2.js';
import {
  loadCandidates,
  loadChunkRows,
  loadOrganizationName,
  loadScopeTotal,
  type CandidateChunk,
} from './knowledge-retrieval-v2-queries.js';

/** Trechos escolhidos e seus vizinhos (ordinal ± 1), sem repetição. */
function withNeighbors(rows: readonly CandidateChunk[]) {
  const wanted = new Map<string, { documentId: string; ordinal: number }>();
  for (const { documentId, ordinal: at } of rows) {
    for (const ordinal of [at - 1, at, at + 1]) {
      if (ordinal >= 0) wanted.set(`${documentId}:${ordinal}`, { documentId, ordinal });
    }
  }
  return [...wanted.values()];
}

/**
 * Busca v2 (DEC-067), OPT-IN: só roda com `retrievalProfile: 'v2'` explícito.
 * Mesmo escopo da v1 (organização, documentos prontos, agente, versão,
 * coleção e filtros). Etapas: pré-filtro SQL (superconjunto) → casamento
 * exato e pré-seleção em memória → linhas completas só dos trechos escolhidos
 * e vizinhos →
 * passagens, classificação e ranking. Nada é gravado.
 */
export async function retrieveKnowledgeV2(
  db: DatabaseInstance,
  scope: KnowledgeAccessScope,
  query: KnowledgeRetrievalQuery,
): Promise<KnowledgeRetrievalResult> {
  const analysis = analyzeKnowledgeQueryV2(query.queryText);
  const input = { scope, query, words: analysis.words, codes: analysis.codes };
  const [candidates, total, orgName] = await Promise.all([
    loadCandidates(db, input),
    loadScopeTotal(db, input),
    loadOrganizationName(db, scope.organizationId),
  ]);
  const terms = compileTerms(analysis.words, analysis.codes);
  const chosen = preselectChunksV2(candidates.rows, terms, total);
  const rows = await loadChunkRows(db, input, withNeighbors(chosen.rows));
  const df = chosen.documentFrequency;
  const evaluated = evaluatePassagesV2({
    rows,
    words: analysis.words,
    codes: analysis.codes,
    aspects: analysis.aspects,
    organizationNameTerms: new Set(orgName ? extractKnowledgeQueryTerms(orgName) : []),
    scope: {
      total,
      codes: df.slice(0, analysis.codes.length),
      words: df.slice(analysis.codes.length),
    },
  });
  const topK = Math.min(Math.max(1, query.topK ?? 5), KNOWLEDGE_RETRIEVAL_MAX_TOP_K);
  return {
    hits: evaluated.hits.slice(0, topK),
    truncated: candidates.capped || evaluated.hits.length > topK,
    unmatchedTerms: evaluated.unmatchedTerms,
    aspectsNotFound: evaluated.aspectsNotFound,
  };
}
