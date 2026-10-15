import {
  type CreateKnowledgeDocumentInput,
  type KnowledgeDocumentStatus,
  validateDocumentStatusTransition,
} from '@voice-agent/contracts';
import { InvalidStateTransitionError } from '@voice-agent/errors';

export function assertValidDocumentTransition(
  from: KnowledgeDocumentStatus,
  to: KnowledgeDocumentStatus,
): void {
  try {
    validateDocumentStatusTransition(from, to);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid state transition';
    throw new InvalidStateTransitionError(msg);
  }
}

export interface InsertKnowledgeDocumentOptions {
  readonly initialStatus?: KnowledgeDocumentStatus | undefined;
  readonly errorMessage?: string | undefined;
  readonly onConflictDoNothing?: boolean | undefined;
  readonly policyIdentity?:
    { policyVersion: string; maxChunkChars: number; overlapChars: number } | undefined;
}

export function buildKnowledgeInsertValues(
  input: CreateKnowledgeDocumentInput,
  options: InsertKnowledgeDocumentOptions,
) {
  return {
    organizationId: input.organizationId,
    title: input.title,
    sourceType: input.source.sourceType,
    sourceLocator: input.source.locator,
    sourceVersion: input.source.sourceVersion,
    contentIdentityAlgorithm: input.contentIdentity?.algorithm,
    contentIdentityValue: input.contentIdentity?.value,
    status: options.initialStatus ?? 'PENDING',
    collection: input.collection,
    agentId: input.agentId,
    agentVersionId: input.agentVersionId,
    chunkPolicyVersion: options.policyIdentity?.policyVersion,
    chunkMaxChars: options.policyIdentity?.maxChunkChars,
    chunkOverlapChars: options.policyIdentity?.overlapChars,
    errorMessage: options.errorMessage,
  };
}
