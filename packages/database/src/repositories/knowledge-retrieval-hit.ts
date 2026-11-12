import type {
  KnowledgeHitRelevance,
  KnowledgeRetrievalHit,
  KnowledgeSourceType,
} from '@voice-agent/contracts';
import type { KnowledgeChunkEntity, KnowledgeDocumentEntity } from '../schema/knowledge.js';

export interface KnowledgeHitSource {
  readonly chunk: KnowledgeChunkEntity;
  readonly doc: KnowledgeDocumentEntity;
  readonly score: number;
  readonly relevance: KnowledgeHitRelevance;
}

/** Linha do banco → resultado do contrato (citação e proveniência). */
export function toKnowledgeRetrievalHit({
  chunk,
  doc,
  score,
  relevance,
}: KnowledgeHitSource): KnowledgeRetrievalHit {
  return {
    chunkId: chunk.id,
    documentId: doc.id,
    organizationId: doc.organizationId,
    textSnapshot: chunk.text,
    documentTitle: doc.title,
    score,
    relevance,
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
  };
}
