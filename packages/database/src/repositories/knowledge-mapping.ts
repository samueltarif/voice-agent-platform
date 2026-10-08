import type {
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSourceType,
  KnowledgeDocumentStatus,
} from '@voice-agent/contracts';
import type { KnowledgeDocumentEntity, KnowledgeChunkEntity } from '../schema/knowledge.js';

export function mapKnowledgeDocument(entity: KnowledgeDocumentEntity): KnowledgeDocument {
  return {
    id: entity.id,
    organizationId: entity.organizationId,
    title: entity.title,
    source: {
      sourceType: entity.sourceType as KnowledgeSourceType,
      locator: entity.sourceLocator,
      ...(entity.sourceVersion ? { sourceVersion: entity.sourceVersion } : {}),
    },
    ...(entity.contentIdentityAlgorithm && entity.contentIdentityValue
      ? {
          contentIdentity: {
            algorithm: entity.contentIdentityAlgorithm,
            value: entity.contentIdentityValue,
          },
        }
      : {}),
    status: entity.status as KnowledgeDocumentStatus,
    ...(entity.collection ? { collection: entity.collection } : {}),
    ...(entity.agentId ? { agentId: entity.agentId } : {}),
    ...(entity.agentVersionId ? { agentVersionId: entity.agentVersionId } : {}),
    ...(entity.errorMessage ? { errorMessage: entity.errorMessage } : {}),
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
