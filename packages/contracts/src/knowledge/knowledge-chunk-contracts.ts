import { z } from 'zod';

export type KnowledgeChunkId = string;

export const knowledgeChunkIdSchema = z.string().uuid();

// Engineering defaults only: chunking policy values are configurable per
// deployment and are NOT constitutional requirements.
export const KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS = 2000;
export const KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS = 200;

// Safety bounds (007J HIGH-2): deterministic, fail-closed resource limits.
// The schema floor (min 100) predates this change and is preserved; the new
// finite maximum, overlap ratio and generation caps close the amplification
// surface for direct chunker callers as well (see knowledge-chunker.ts).
export const KNOWLEDGE_CHUNK_MAX_CHARS = 8000;
export const KNOWLEDGE_CHUNK_MAX_OVERLAP_NUMERATOR = 1;
export const KNOWLEDGE_CHUNK_MAX_OVERLAP_DENOMINATOR = 2;
export const KNOWLEDGE_CHUNK_MAX_GENERATED_CHUNKS = 1000;
export const KNOWLEDGE_CHUNK_MAX_AGGREGATE_CHARS = 400_000;

export const knowledgeChunkingPolicySchema = z
  .object({
    policyVersion: z.string().trim().min(1).max(50),
    maxChunkChars: z
      .number()
      .int()
      .min(100)
      .max(KNOWLEDGE_CHUNK_MAX_CHARS)
      .default(KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS),
    overlapChars: z.number().int().min(0).default(KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS),
  })
  .strict()
  .refine((policy) => policy.overlapChars < policy.maxChunkChars, {
    message: 'overlapChars must be smaller than maxChunkChars',
  })
  .refine(
    (policy) =>
      policy.overlapChars * KNOWLEDGE_CHUNK_MAX_OVERLAP_DENOMINATOR <=
      policy.maxChunkChars * KNOWLEDGE_CHUNK_MAX_OVERLAP_NUMERATOR,
    {
      message: 'overlapChars must not exceed 50% of maxChunkChars',
    },
  );

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
