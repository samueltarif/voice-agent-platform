import { z } from 'zod';

export type KnowledgeChunkId = string;

export const knowledgeChunkIdSchema = z.string().uuid();

// Engineering defaults only: chunking policy values are configurable per
// deployment and are NOT constitutional requirements.
export const KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS = 2000;
export const KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS = 200;

export const knowledgeChunkingPolicySchema = z
  .object({
    policyVersion: z.string().trim().min(1).max(50),
    maxChunkChars: z.number().int().min(100).default(KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS),
    overlapChars: z.number().int().min(0).default(KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS),
  })
  .strict()
  .refine((policy) => policy.overlapChars < policy.maxChunkChars, {
    message: 'overlapChars must be smaller than maxChunkChars',
  });

export type KnowledgeChunkingPolicy = z.infer<typeof knowledgeChunkingPolicySchema>;

export const knowledgeChunkSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    documentId: z.string().uuid(),
    ordinal: z.number().int().min(0),
    text: z.string().min(1).max(8000),
    policyVersion: z.string().trim().min(1).max(50),
    contentIdentityValue: z.string().trim().min(1).optional(),
  })
  .strict();

export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

export interface StableChunkIdentityInput {
  readonly documentId: string;
  readonly policyVersion: string;
  readonly ordinal: number;
  readonly contentIdentityValue: string;
}

export function buildStableChunkIdentity(input: StableChunkIdentityInput): string {
  return `${input.documentId}:${input.policyVersion}:${input.ordinal}:${input.contentIdentityValue}`;
}

export interface KnowledgeChunkProvenance {
  readonly organizationId: string;
  readonly documentId: string;
  readonly chunkId: KnowledgeChunkId;
  readonly chunkOrdinal: number;
  readonly policyVersion: string;
  readonly contentIdentityValue?: string | undefined;
}
