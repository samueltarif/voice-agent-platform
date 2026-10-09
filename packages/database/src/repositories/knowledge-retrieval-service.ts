import { and, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import {
  type KnowledgeAccessScope,
  type KnowledgeRetrievalHit,
  type KnowledgeRetrievalPort,
  type KnowledgeRetrievalQuery,
  type KnowledgeRetrievalRequest,
  type KnowledgeRetrievalResult,
  type KnowledgeSourceType,
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
import { computeLexicalScore, extractQueryTokens } from './knowledge-retrieval-scoring.js';

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
    const termMatches = tokens.map((t) => ilike(knowledgeChunks.text, `%${t}%`));
    clauses.push(or(...termMatches)!);
  }

  return clauses;
}

function rankAndSortHits(
  rows: readonly { chunk: KnowledgeChunkEntity; doc: KnowledgeDocumentEntity }[],
  tokens: readonly string[],
): KnowledgeRetrievalHit[] {
  const scoredHits: KnowledgeRetrievalHit[] = [];

  for (const { chunk, doc } of rows) {
    const score = computeLexicalScore(chunk.text, tokens);
    if (score <= 0 && tokens.length > 0) continue;

    scoredHits.push({
      chunkId: chunk.id,
      documentId: doc.id,
      organizationId: doc.organizationId,
      textSnapshot: chunk.text,
      score,
      provenance: {
        organizationId: doc.organizationId,
        documentId: doc.id,
        chunkId: chunk.id,
        chunkOrdinal: chunk.ordinal,
        policyVersion: chunk.policyVersion,
        ...(chunk.contentIdentityValue ? { contentIdentityValue: chunk.contentIdentityValue } : {}),
      },
      citation: {
        documentId: doc.id,
        chunkId: chunk.id,
        sourceType: doc.sourceType as KnowledgeSourceType,
        sourceLocator: doc.sourceLocator,
        chunkOrdinal: chunk.ordinal,
      },
    });
  }

  scoredHits.sort(
    (a, b) =>
      b.score - a.score ||
      a.provenance.chunkOrdinal - b.provenance.chunkOrdinal ||
      a.chunkId.localeCompare(b.chunkId),
  );

  return scoredHits;
}

export class DrizzleKnowledgeRetrievalService implements KnowledgeRetrievalPort {
  constructor(private readonly db: DatabaseInstance) {}

  async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    const scope = knowledgeAccessScopeSchema.parse(request.scope);
    const query = knowledgeRetrievalQuerySchema.parse(request.query);
    const tokens = extractQueryTokens(query.queryText);
    const predicates = [...buildScopePredicates(scope), ...buildQueryPredicates(query, tokens)];

    const rows = await this.db
      .select({ chunk: knowledgeChunks, doc: knowledgeDocuments })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(and(...predicates));

    const scoredHits = rankAndSortHits(rows, tokens);
    const clampedTopK = Math.min(Math.max(1, query.topK ?? 5), KNOWLEDGE_RETRIEVAL_MAX_TOP_K);
    const truncated = scoredHits.length > clampedTopK;
    const hits = scoredHits.slice(0, clampedTopK);

    return { hits, truncated };
  }
}
