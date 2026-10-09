import type {
  CreateKnowledgeDocumentInput,
  KnowledgeChunk,
  KnowledgeChunkingPolicy,
  KnowledgeDocument,
  KnowledgeSourceReference,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';

export interface IngestKnowledgeDocumentInput {
  readonly organizationId: string;
  readonly title: string;
  readonly source: KnowledgeSourceReference;
  readonly rawText: string;
  readonly collection?: string | undefined;
  readonly agentId?: string | undefined;
  readonly agentVersionId?: string | undefined;
  readonly chunkingPolicy?: KnowledgeChunkingPolicy | undefined;
}

export interface IngestKnowledgeDocumentResult {
  readonly document: KnowledgeDocument;
  readonly chunks: readonly KnowledgeChunk[];
  readonly isIdempotentDuplicate: boolean;
}

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
}

export interface ResolveWinningOptions {
  readonly db: DatabaseInstance;
  readonly orgId: string;
  readonly input: IngestKnowledgeDocumentInput;
  readonly contentHash: string;
}
