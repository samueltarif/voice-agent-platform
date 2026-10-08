import { z } from 'zod';
import { knowledgeSourceTypeSchema } from './knowledge-document-contracts.js';
import type { KnowledgeAccessScope } from './knowledge-access-scope-contracts.js';
import type { KnowledgeChunkProvenance } from './knowledge-chunk-contracts.js';

// Engineering defaults only: result bounds are configurable per deployment
// and are NOT constitutional requirements.
export const KNOWLEDGE_RETRIEVAL_MAX_TOP_K = 20;
export const KNOWLEDGE_RETRIEVAL_DEFAULT_TOP_K = 5;

export const knowledgeRetrievalQuerySchema = z
  .object({
    queryText: z.string().trim().min(1).max(2000),
    topK: z
      .number()
      .int()
      .min(1)
      .max(KNOWLEDGE_RETRIEVAL_MAX_TOP_K)
      .default(KNOWLEDGE_RETRIEVAL_DEFAULT_TOP_K),
    documentIds: z.array(z.string().uuid()).max(50).optional(),
    sourceTypes: z.array(knowledgeSourceTypeSchema).max(10).optional(),
  })
  .strict();

export type KnowledgeRetrievalQuery = z.infer<typeof knowledgeRetrievalQuerySchema>;

export const knowledgeCitationSchema = z
  .object({
    documentId: z.string().uuid(),
    chunkId: z.string().uuid(),
    sourceType: knowledgeSourceTypeSchema,
    sourceLocator: z.string().trim().min(1).max(1000),
    chunkOrdinal: z.number().int().min(0),
  })
  .strict();

export type KnowledgeCitation = z.infer<typeof knowledgeCitationSchema>;

export interface KnowledgeRetrievalHit {
  readonly chunkId: string;
  readonly documentId: string;
  readonly organizationId: string;
  readonly textSnapshot: string;
  readonly score: number;
  readonly provenance: KnowledgeChunkProvenance;
  readonly citation: KnowledgeCitation;
}

export interface KnowledgeRetrievalResult {
  readonly hits: readonly KnowledgeRetrievalHit[];
  readonly truncated: boolean;
}

export interface KnowledgeRetrievalRequest {
  readonly scope: KnowledgeAccessScope;
  readonly query: KnowledgeRetrievalQuery;
}

export interface KnowledgeRetrievalPort {
  retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult>;
}

export interface KnowledgeEmbeddingRequest {
  readonly organizationId: string;
  readonly documentId: string;
  readonly chunkId: string;
  readonly text: string;
}

export interface KnowledgeEmbeddingResult {
  readonly chunkId: string;
  readonly modelVersion: string;
  readonly dimensions: number;
}

export interface KnowledgeEmbeddingPort {
  embed(request: KnowledgeEmbeddingRequest): Promise<KnowledgeEmbeddingResult>;
}
