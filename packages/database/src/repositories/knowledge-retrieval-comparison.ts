import {
  buildKnowledgeExcerpt,
  KNOWLEDGE_PREVIEW_DEFAULT_TOP_K,
  KNOWLEDGE_PREVIEW_MAX_EXCERPT_CHARS,
  type KnowledgeRetrievalComparison,
  type KnowledgeRetrievalComparisonPort,
  type KnowledgeRetrievalHit,
  type KnowledgeRetrievalPreview,
  type KnowledgeRetrievalPreviewInput,
  type KnowledgeSuspiciousPreviewPassage,
  knowledgeRetrievalQuerySchema,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { retrieveKnowledgeV2Detailed } from './knowledge-retrieval-v2.js';
import type { SuspiciousPassageHit } from './knowledge-passage-trust-v2.js';
import {
  DrizzleKnowledgeRetrievalPreviewService,
  resolveAgentScope,
  type ResolvedScope,
} from './knowledge-retrieval-preview.js';
import { analyzeKnowledgeQueryV2 } from './knowledge-query-analysis-v2.js';

function toSuspiciousPassage(
  { hit, signals }: SuspiciousPassageHit,
  priority: readonly string[],
): KnowledgeSuspiciousPreviewPassage {
  return {
    citationId: `${hit.documentId}:${hit.chunkId}:${hit.citation.chunkOrdinal}`,
    documentId: hit.documentId,
    documentTitle: hit.documentTitle ?? hit.citation.sourceLocator,
    chunkOrdinal: hit.citation.chunkOrdinal,
    sourceType: hit.citation.sourceType,
    excerpt: buildKnowledgeExcerpt(hit.textSnapshot, priority, KNOWLEDGE_PREVIEW_MAX_EXCERPT_CHARS),
    ...(hit.passage?.heading ? { passageHeading: hit.passage.heading } : {}),
    signals,
  };
}

function toV2PreviewHit(hit: KnowledgeRetrievalHit, priority: readonly string[]) {
  return {
    citationId: `${hit.documentId}:${hit.chunkId}:${hit.citation.chunkOrdinal}`,
    documentId: hit.documentId,
    documentTitle: hit.documentTitle ?? hit.citation.sourceLocator,
    chunkOrdinal: hit.citation.chunkOrdinal,
    sourceType: hit.citation.sourceType,
    sourceLocator: hit.citation.sourceLocator,
    excerpt: buildKnowledgeExcerpt(hit.textSnapshot, priority, KNOWLEDGE_PREVIEW_MAX_EXCERPT_CHARS),
    score: hit.score,
    relevance: hit.relevance ?? 'CONTEXT',
    ...(hit.passage?.heading ? { passageHeading: hit.passage.heading } : {}),
  };
}

/**
 * Comparação ADMINISTRATIVA v1 × v2 (DEC-067). A coluna v1 é a pré-visualização
 * existente, sem mudança. A v2 usa o MESMO escopo resolvido (organização da
 * asserção; agente ativo + versão publicada) e só é executada aqui: nenhum
 * agente passa a usá-la. Resposta `UNTRUSTED_DATA`; nada é gravado.
 */
export class DrizzleKnowledgeRetrievalComparisonService implements KnowledgeRetrievalComparisonPort {
  private readonly preview: DrizzleKnowledgeRetrievalPreviewService;

  constructor(private readonly db: DatabaseInstance) {
    this.preview = new DrizzleKnowledgeRetrievalPreviewService(db);
  }

  async compare(input: KnowledgeRetrievalPreviewInput): Promise<KnowledgeRetrievalComparison> {
    const v1 = await this.preview.preview(input);
    const v2 = await this.previewV2(input);
    return { trust: 'UNTRUSTED_DATA', v1: { ...v1, retrievalProfile: 'v1' }, v2 };
  }

  private async previewV2(
    input: KnowledgeRetrievalPreviewInput,
  ): Promise<KnowledgeRetrievalPreview> {
    const resolved: ResolvedScope = input.agentId
      ? await resolveAgentScope(this.db, input.organizationId, input.agentId)
      : { scope: { organizationId: input.organizationId } };
    const analysis = analyzeKnowledgeQueryV2(input.queryText);
    const terms = [...analysis.codes, ...analysis.words];
    const { result, suspicious } = await retrieveKnowledgeV2Detailed(
      this.db,
      resolved.scope,
      knowledgeRetrievalQuerySchema.parse({
        queryText: input.queryText,
        topK: input.topK ?? KNOWLEDGE_PREVIEW_DEFAULT_TOP_K,
        retrievalProfile: 'v2',
      }),
    );
    return {
      trust: 'UNTRUSTED_DATA',
      mode: input.agentId ? 'AGENT' : 'ORGANIZATION',
      ...(input.agentId ? { agentId: input.agentId, agentVersionId: resolved.agentVersionId } : {}),
      terms,
      unmatchedTerms: result.unmatchedTerms ?? [],
      hits: result.hits.map((hit) => toV2PreviewHit(hit, terms)),
      truncated: result.truncated,
      retrievalProfile: 'v2',
      aspectsNotFound: result.aspectsNotFound ?? [],
      suspiciousPassages: suspicious.map((s) => toSuspiciousPassage(s, terms)),
      ...(result.agentProjection ? { agentProjection: result.agentProjection } : {}),
    };
  }
}
