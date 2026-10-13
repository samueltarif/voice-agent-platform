import type { DatabaseInstance } from '../client/connection.js';
import type {
  IngestKnowledgeDocumentInput,
  IngestKnowledgeDocumentResult,
  KnowledgeDocument,
  KnowledgeRepositoryPort,
  ListKnowledgeDocumentsOptions,
} from '@voice-agent/contracts';
import { ingestKnowledgeDocument } from './knowledge-ingestion-service.js';
import {
  getKnowledgeDocumentById,
  listKnowledgeDocuments,
  updateKnowledgeDocumentStatus,
} from './knowledge-document-repository.js';

export class DrizzleKnowledgeRepository implements KnowledgeRepositoryPort {
  constructor(private readonly db: DatabaseInstance) {}

  async ingestDocument(
    input: IngestKnowledgeDocumentInput,
  ): Promise<IngestKnowledgeDocumentResult> {
    return ingestKnowledgeDocument(this.db, input);
  }

  async getDocumentById(
    organizationId: string,
    documentId: string,
  ): Promise<KnowledgeDocument | null> {
    return getKnowledgeDocumentById(this.db, organizationId, documentId);
  }

  async listDocuments(
    organizationId: string,
    options?: ListKnowledgeDocumentsOptions,
  ): Promise<KnowledgeDocument[]> {
    return listKnowledgeDocuments(this.db, organizationId, options);
  }

  async archiveDocument(organizationId: string, documentId: string): Promise<KnowledgeDocument> {
    return updateKnowledgeDocumentStatus(this.db, {
      organizationId,
      documentId,
      nextStatus: 'ARCHIVED',
    });
  }
}
