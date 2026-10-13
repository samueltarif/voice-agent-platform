import type {
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSourceType,
  KnowledgeDocumentStatus,
} from '@voice-agent/contracts';
import type { KnowledgeDocumentEntity, KnowledgeChunkEntity } from '../schema/knowledge.js';

function hasDurablePolicyIdentity(entity: KnowledgeDocumentEntity): boolean {
  return (
    typeof entity.chunkPolicyVersion === 'string' &&
    entity.chunkPolicyVersion.length > 0 &&
    typeof entity.chunkMaxChars === 'number' &&
    typeof entity.chunkOverlapChars === 'number'
  );
}

function toSourceReference(entity: KnowledgeDocumentEntity) {
  return {
    sourceType: entity.sourceType as KnowledgeSourceType,
    locator: entity.sourceLocator,
    ...(entity.sourceVersion ? { sourceVersion: entity.sourceVersion } : {}),
  };
}

function pickContentIdentity(entity: KnowledgeDocumentEntity) {
  const hasIdentity = entity.contentIdentityAlgorithm && entity.contentIdentityValue;
  if (!hasIdentity) return {};
  return {
    contentIdentity: {
      algorithm: entity.contentIdentityAlgorithm as string,
      value: entity.contentIdentityValue as string,
    },
  };
}

function pickScopeFields(entity: KnowledgeDocumentEntity) {
  return {
    ...(entity.collection ? { collection: entity.collection } : {}),
    ...(entity.agentId ? { agentId: entity.agentId } : {}),
    ...(entity.agentVersionId ? { agentVersionId: entity.agentVersionId } : {}),
    ...(entity.errorMessage ? { errorMessage: entity.errorMessage } : {}),
  };
}

function pickPolicyField(entity: KnowledgeDocumentEntity, present: boolean) {
  if (!present) return {};
  return {
    chunkingPolicy: {
      policyVersion: entity.chunkPolicyVersion as string,
      maxChunkChars: entity.chunkMaxChars as number,
      overlapChars: entity.chunkOverlapChars as number,
    },
  };
}

export function mapKnowledgeDocument(entity: KnowledgeDocumentEntity): KnowledgeDocument {
  const policyPresent = hasDurablePolicyIdentity(entity);
  return {
    id: entity.id,
    organizationId: entity.organizationId,
    title: entity.title,
    source: toSourceReference(entity),
    ...pickContentIdentity(entity),
    status: entity.status as KnowledgeDocumentStatus,
    ...pickScopeFields(entity),
    ...pickPolicyField(entity, policyPresent),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function mapKnowledgeChunk(entity: KnowledgeChunkEntity): KnowledgeChunk {
  return {
    id: entity.id,
    organizationId: entity.organizationId,
    documentId: entity.documentId,
    ordinal: entity.ordinal,
    text: entity.text,
    policyVersion: entity.policyVersion,
    ...(entity.contentIdentityValue ? { contentIdentityValue: entity.contentIdentityValue } : {}),
  };
}
