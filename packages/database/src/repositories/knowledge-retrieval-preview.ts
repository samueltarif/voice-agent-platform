import { and, eq } from 'drizzle-orm';
import { AppError } from '@voice-agent/errors';
import {
  buildKnowledgeExcerpt,
  foldKnowledgeText,
  KNOWLEDGE_PREVIEW_DEFAULT_TOP_K,
  KNOWLEDGE_PREVIEW_ERROR_CODES,
  KNOWLEDGE_PREVIEW_MAX_EXCERPT_CHARS,
  type KnowledgeAccessScope,
  type KnowledgeRetrievalHit,
  type KnowledgeRetrievalPreview,
  type KnowledgeRetrievalPreviewInput,
  type KnowledgeRetrievalPreviewPort,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { agents, agentVersions } from '../schema/agents.js';
import { DrizzleKnowledgeRetrievalService } from './knowledge-retrieval-service.js';
import { extractKnowledgeQueryTerms } from './knowledge-query-terms.js';
import { computeTermWeights } from './knowledge-retrieval-scoring.js';

interface ResolvedScope {
  readonly scope: KnowledgeAccessScope;
  readonly agentVersionId?: string | undefined;
}

/**
 * Mesmo escopo de uma chamada: agente ATIVO da organização e sua versão
 * PUBLICADA. Agente inexistente, de outra organização ou arquivado recebem a
 * mesma resposta (não revela existência).
 */
async function resolveAgentScope(
  db: DatabaseInstance,
  organizationId: string,
  agentId: string,
): Promise<ResolvedScope> {
  const [agent] = await db
    .select({ id: agents.id, status: agents.status })
    .from(agents)
    .where(and(eq(agents.organizationId, organizationId), eq(agents.id, agentId)));
  if (!agent || agent.status !== 'ACTIVE') {
    throw new AppError(
      'Agent is not available',
      409,
      KNOWLEDGE_PREVIEW_ERROR_CODES.AGENT_UNAVAILABLE,
    );
  }
  const [published] = await db
    .select({ id: agentVersions.id })
    .from(agentVersions)
    .where(
      and(
        eq(agentVersions.organizationId, organizationId),
        eq(agentVersions.agentId, agentId),
        eq(agentVersions.status, 'PUBLISHED'),
      ),
    );
  if (!published) {
    throw new AppError(
      'Agent has no published version',
      409,
      KNOWLEDGE_PREVIEW_ERROR_CODES.AGENT_NOT_PUBLISHED,
    );
  }
  return {
    scope: { organizationId, agentId, agentVersionId: published.id },
    agentVersionId: published.id,
  };
}

/** Prioridade do recorte: termos mais raros entre os trechos encontrados primeiro. */
function termsByRarity(hits: readonly KnowledgeRetrievalHit[], terms: readonly string[]) {
  const weights = computeTermWeights(
    hits.map((h) => foldKnowledgeText(h.textSnapshot)),
    terms,
  );
  return terms
    .map((term, i) => ({ term, weight: weights[i] ?? 0 }))
    .sort((a, b) => b.weight - a.weight)
    .map((t) => t.term);
}

function toPreviewHit(hit: KnowledgeRetrievalHit, priority: readonly string[]) {
  return {
    citationId: `${hit.documentId}:${hit.chunkId}:${hit.citation.chunkOrdinal}`,
    documentId: hit.documentId,
    documentTitle: hit.documentTitle ?? hit.citation.sourceLocator,
    chunkOrdinal: hit.citation.chunkOrdinal,
    sourceType: hit.citation.sourceType,
    sourceLocator: hit.citation.sourceLocator,
    excerpt: buildKnowledgeExcerpt(hit.textSnapshot, priority, KNOWLEDGE_PREVIEW_MAX_EXCERPT_CHARS),
    score: hit.score,
    relevance: hit.relevance ?? 'DIRECT',
  };
}

/** Pré-visualização offline: a mesma busca que um agente faria, sem IA e sem chamada. */
export class DrizzleKnowledgeRetrievalPreviewService implements KnowledgeRetrievalPreviewPort {
  private readonly retrieval: DrizzleKnowledgeRetrievalService;

  constructor(private readonly db: DatabaseInstance) {
    this.retrieval = new DrizzleKnowledgeRetrievalService(db);
  }

  async preview(input: KnowledgeRetrievalPreviewInput): Promise<KnowledgeRetrievalPreview> {
    const resolved: ResolvedScope = input.agentId
      ? await resolveAgentScope(this.db, input.organizationId, input.agentId)
      : { scope: { organizationId: input.organizationId } };
    const terms = extractKnowledgeQueryTerms(input.queryText);
    const result = await this.retrieval.retrieve({
      scope: resolved.scope,
      query: { queryText: input.queryText, topK: input.topK ?? KNOWLEDGE_PREVIEW_DEFAULT_TOP_K },
    });
    const priority = termsByRarity(result.hits, terms);
    return {
      trust: 'UNTRUSTED_DATA',
      mode: input.agentId ? 'AGENT' : 'ORGANIZATION',
      ...(input.agentId ? { agentId: input.agentId, agentVersionId: resolved.agentVersionId } : {}),
      terms,
      unmatchedTerms: result.unmatchedTerms ?? [],
      hits: result.hits.map((hit) => toPreviewHit(hit, priority)),
      truncated: result.truncated,
    };
  }
}
