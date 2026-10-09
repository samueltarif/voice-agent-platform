import { z } from 'zod';
import {
  type KnowledgeDocument,
  type KnowledgeDocumentStatus,
  type KnowledgeSourceReference,
  knowledgeDocumentStatusSchema,
  knowledgeSourceReferenceSchema,
  knowledgeContentIdentitySchema,
} from './knowledge-document-contracts.js';
import {
  type KnowledgeChunk,
  type KnowledgeChunkingPolicy,
  knowledgeChunkingPolicySchema,
} from './knowledge-chunk-contracts.js';

export const ingestKnowledgeDocumentHttpBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    source: knowledgeSourceReferenceSchema,
    rawText: z.string().min(1).max(200_000),
    collection: z.string().trim().min(1).max(100).optional(),
    agentId: z.string().uuid().optional(),
    agentVersionId: z.string().uuid().optional(),
    chunkingPolicy: knowledgeChunkingPolicySchema.optional(),
  })
  .strict();

export type IngestKnowledgeDocumentHttpBody = z.infer<typeof ingestKnowledgeDocumentHttpBodySchema>;

export const listKnowledgeDocumentsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
    offset: z.coerce.number().int().min(0).default(0).optional(),
    status: knowledgeDocumentStatusSchema.optional(),
    collection: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type ListKnowledgeDocumentsQuery = z.infer<typeof listKnowledgeDocumentsQuerySchema>;

export const knowledgeDocumentResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    title: z.string(),
    source: knowledgeSourceReferenceSchema,
    contentIdentity: knowledgeContentIdentitySchema.optional(),
    status: knowledgeDocumentStatusSchema,
    collection: z.string().nullable().optional(),
    agentId: z.string().uuid().nullable().optional(),
    agentVersionId: z.string().uuid().nullable().optional(),
    isIdempotentDuplicate: z.boolean().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type KnowledgeDocumentResponse = z.infer<typeof knowledgeDocumentResponseSchema>;

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

export interface ListKnowledgeDocumentsOptions {
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  readonly status?: KnowledgeDocumentStatus | undefined;
  readonly collection?: string | undefined;
}

export interface KnowledgeRepositoryPort {
  ingestDocument(input: IngestKnowledgeDocumentInput): Promise<IngestKnowledgeDocumentResult>;
  getDocumentById(organizationId: string, documentId: string): Promise<KnowledgeDocument | null>;
  listDocuments(
    organizationId: string,
    options?: ListKnowledgeDocumentsOptions,
  ): Promise<KnowledgeDocument[]>;
  archiveDocument(organizationId: string, documentId: string): Promise<KnowledgeDocument>;
}
