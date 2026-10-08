import { z } from 'zod';

export const KNOWLEDGE_SOURCE_TYPES = [
  'MANUAL_UPLOAD',
  'PRODUCT_MANUAL',
  'FAQ',
  'POLICY',
  'SALES_SCRIPT',
  'HELP_CENTER_IMPORT',
  'OTHER',
] as const;

export const knowledgeSourceTypeSchema = z.enum(KNOWLEDGE_SOURCE_TYPES);
export type KnowledgeSourceType = z.infer<typeof knowledgeSourceTypeSchema>;

export const KNOWLEDGE_DOCUMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'ARCHIVED',
] as const;

export const knowledgeDocumentStatusSchema = z.enum(KNOWLEDGE_DOCUMENT_STATUSES);
export type KnowledgeDocumentStatus = z.infer<typeof knowledgeDocumentStatusSchema>;

export type KnowledgeDocumentId = string;

export const knowledgeDocumentIdSchema = z.string().uuid();

const DOCUMENT_TRANSITIONS: Readonly<
  Record<KnowledgeDocumentStatus, ReadonlySet<KnowledgeDocumentStatus>>
> = {
  PENDING: new Set(['PROCESSING', 'ARCHIVED']),
  PROCESSING: new Set(['READY', 'FAILED', 'ARCHIVED']),
  READY: new Set(['ARCHIVED']),
  FAILED: new Set(['ARCHIVED']),
  ARCHIVED: new Set(),
};

export function isValidDocumentStatusTransition(
  from: KnowledgeDocumentStatus,
  to: KnowledgeDocumentStatus,
): boolean {
  if (from === to) return true;
  const allowed = DOCUMENT_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

export function validateDocumentStatusTransition(
  from: KnowledgeDocumentStatus,
  to: KnowledgeDocumentStatus,
): void {
  if (!isValidDocumentStatusTransition(from, to)) {
    throw new Error(`Invalid knowledge document status transition from '${from}' to '${to}'`);
  }
}

export const knowledgeContentIdentitySchema = z
  .object({
    algorithm: z.string().trim().min(1),
    value: z.string().trim().min(1),
  })
  .strict();

export type KnowledgeContentIdentity = z.infer<typeof knowledgeContentIdentitySchema>;

export const knowledgeSourceReferenceSchema = z
  .object({
    sourceType: knowledgeSourceTypeSchema,
    locator: z.string().trim().min(1).max(1000),
    sourceVersion: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type KnowledgeSourceReference = z.infer<typeof knowledgeSourceReferenceSchema>;

export const createKnowledgeDocumentInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    source: knowledgeSourceReferenceSchema,
    contentIdentity: knowledgeContentIdentitySchema.optional(),
  })
  .strict();

export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentInputSchema>;

export interface KnowledgeDocument {
  readonly id: KnowledgeDocumentId;
  readonly organizationId: string;
  readonly title: string;
  readonly source: KnowledgeSourceReference;
  readonly contentIdentity?: KnowledgeContentIdentity | undefined;
  readonly status: KnowledgeDocumentStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
