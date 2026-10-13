import type {
  CreateKnowledgeDocumentInput,
  IngestKnowledgeDocumentInput,
  IngestKnowledgeDocumentResult,
  KnowledgeChunk,
  KnowledgeChunkingPolicy,
} from '@voice-agent/contracts';

import type { DatabaseInstance } from '../client/connection.js';

export type { IngestKnowledgeDocumentInput, IngestKnowledgeDocumentResult };

export interface DuplicateCheckOptions {
  readonly db: DatabaseInstance;
  readonly orgId: string;
  readonly contentHash: string;
  readonly documentInput: CreateKnowledgeDocumentInput;
}

export interface TransactionalIngestionOptions {
  readonly db: DatabaseInstance;
  readonly input: IngestKnowledgeDocumentInput;
  readonly documentInput: CreateKnowledgeDocumentInput;
  readonly normalizedText: string;
  readonly effectivePolicy: KnowledgeChunkingPolicy;
}

export interface ResolveWinningOptions {
  readonly db: DatabaseInstance;
  readonly orgId: string;
  readonly input: IngestKnowledgeDocumentInput;
  readonly contentHash: string;
  readonly normalizedText: string;
  readonly effectivePolicy: KnowledgeChunkingPolicy;
}

export interface PayloadEquivalenceScope {
  readonly contentHash: string;
  readonly existingChunks: readonly KnowledgeChunk[];
  readonly normalizedText: string;
  readonly effectivePolicy: KnowledgeChunkingPolicy;
}
