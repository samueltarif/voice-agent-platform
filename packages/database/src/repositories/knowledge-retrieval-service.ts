import { and, asc, count, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  type KnowledgeAccessScope,
  type KnowledgeHitRelevance,
  type KnowledgeRetrievalHit,
  type KnowledgeRetrievalPort,
  type KnowledgeRetrievalQuery,
  type KnowledgeRetrievalRequest,
  type KnowledgeRetrievalResult,
  KNOWLEDGE_RETRIEVAL_MAX_TOP_K,
  knowledgeAccessScopeSchema,
  knowledgeRetrievalQuerySchema,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import {
  knowledgeChunks,
  knowledgeDocuments,
  type KnowledgeChunkEntity,
  type KnowledgeDocumentEntity,
} from '../schema/knowledge.js';
import { computeTermWeights, scoreKnowledgeChunk } from './knowledge-retrieval-scoring.js';
import { toKnowledgeRetrievalHit } from './knowledge-retrieval-hit.js';
import { classifyKnowledgeHit, planKnowledgeTerms } from './knowledge-term-relevance.js';
import {
  extractKnowledgeQueryTerms,
  foldKnowledgeText,
  KNOWLEDGE_ACCENTED_CHARS,
  KNOWLEDGE_PLAIN_CHARS,
} from './knowledge-query-terms.js';

/** Teto de trechos candidatos lidos por consulta (proteção de memória e tempo). */
export const KNOWLEDGE_RETRIEVAL_MAX_CANDIDATES = 2000;

/** Casa o termo sem distinguir acento nem caixa (o termo já vem normalizado). */
function termMatches(term: string): SQL {
  return sql`translate(${knowledgeChunks.text}, ${KNOWLEDGE_ACCENTED_CHARS}, ${KNOWLEDGE_PLAIN_CHARS}) ilike ${`%${term}%`}`;
}

function buildScopePredicates(scope: KnowledgeAccessScope): SQL[] {
  const clauses: SQL[] = [
    eq(knowledgeChunks.organizationId, scope.organizationId),
    eq(knowledgeDocuments.organizationId, scope.organizationId),
    eq(knowledgeDocuments.status, 'READY'),
  ];

  if (scope.collection) {
    clauses.push(eq(knowledgeDocuments.collection, scope.collection));
  }
  if (scope.agentId) {
    clauses.push(
      or(isNull(knowledgeDocuments.agentId), eq(knowledgeDocuments.agentId, scope.agentId))!,
    );
  }
  if (scope.agentVersionId) {
    clauses.push(
      or(
        isNull(knowledgeDocuments.agentVersionId),
        eq(knowledgeDocuments.agentVersionId, scope.agentVersionId),
      )!,
    );
  }

  return clauses;
}

function buildQueryPredicates(query: KnowledgeRetrievalQuery, tokens: readonly string[]): SQL[] {
  const clauses: SQL[] = [];

  if (query.documentIds && query.documentIds.length > 0) {
    clauses.push(inArray(knowledgeDocuments.id, query.documentIds));
  }
  if (query.sourceTypes && query.sourceTypes.length > 0) {
    clauses.push(inArray(knowledgeDocuments.sourceType, query.sourceTypes));
  }
  if (tokens.length > 0) {
    clauses.push(or(...tokens.map(termMatches))!);
  }

  return clauses;
}

interface RankInput {
  readonly rows: readonly { chunk: KnowledgeChunkEntity; doc: KnowledgeDocumentEntity }[];
  readonly tokens: readonly string[];
  readonly scopeChunkCount: number;
}

const RELEVANCE_ORDER: Readonly<Record<KnowledgeHitRelevance, number>> = { DIRECT: 0, CONTEXT: 1 };

/** Pontua, aplica a regra central × genérico e ordena: DIRECT antes de CONTEXT. */
function rankAndSortHits({ rows, tokens, scopeChunkCount }: RankInput) {
  const folded = rows.map(({ chunk }) => foldKnowledgeText(chunk.text));
  const weights = computeTermWeights(folded, tokens);
  const frequency = tokens.map((t) => folded.filter((text) => text.includes(t)).length);
  const plan = planKnowledgeTerms(tokens, frequency, scopeChunkCount);
  const hits: KnowledgeRetrievalHit[] = [];
  for (const [index, { chunk, doc }] of rows.entries()) {
    const score = scoreKnowledgeChunk(folded[index]!, tokens, weights);
    if (score <= 0 && tokens.length > 0) continue;
    const relevance = classifyKnowledgeHit(folded[index]!, plan);
    if (relevance) hits.push(toKnowledgeRetrievalHit({ chunk, doc, score, relevance }));
  }
  hits.sort(
    (a, b) =>
      RELEVANCE_ORDER[a.relevance ?? 'DIRECT'] - RELEVANCE_ORDER[b.relevance ?? 'DIRECT'] ||
      b.score - a.score ||
      a.provenance.chunkOrdinal - b.provenance.chunkOrdinal ||
      a.chunkId.localeCompare(b.chunkId),
  );
  return { hits, unmatchedTerms: plan.unmatched };
}

export class DrizzleKnowledgeRetrievalService implements KnowledgeRetrievalPort {
  constructor(private readonly db: DatabaseInstance) {}

  async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    const scope = knowledgeAccessScopeSchema.parse(request.scope);
    const query = knowledgeRetrievalQuerySchema.parse(request.query);
    const tokens = extractKnowledgeQueryTerms(query.queryText);
    const predicates = [...buildScopePredicates(scope), ...buildQueryPredicates(query, tokens)];

    const rows = await this.db
      .select({ chunk: knowledgeChunks, doc: knowledgeDocuments })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(and(...predicates))
      .orderBy(asc(knowledgeChunks.documentId), asc(knowledgeChunks.ordinal))
      .limit(KNOWLEDGE_RETRIEVAL_MAX_CANDIDATES + 1);

    const candidatesCapped = rows.length > KNOWLEDGE_RETRIEVAL_MAX_CANDIDATES;
    const scopeChunkCount = await this.countScopeChunks(scope, query);
    const ranked = rankAndSortHits({
      rows: rows.slice(0, KNOWLEDGE_RETRIEVAL_MAX_CANDIDATES),
      tokens,
      scopeChunkCount,
    });
    const clampedTopK = Math.min(Math.max(1, query.topK ?? 5), KNOWLEDGE_RETRIEVAL_MAX_TOP_K);
    const truncated = candidatesCapped || ranked.hits.length > clampedTopK;
    const hits = ranked.hits.slice(0, clampedTopK);

    return { hits, truncated, unmatchedTerms: ranked.unmatchedTerms };
  }

  /** Total de trechos prontos no escopo (para identificar termos ubíquos). */
  private async countScopeChunks(
    scope: KnowledgeAccessScope,
    query: KnowledgeRetrievalQuery,
  ): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(and(...buildScopePredicates(scope), ...buildQueryPredicates(query, [])));
    return row?.total ?? 0;
  }
}
