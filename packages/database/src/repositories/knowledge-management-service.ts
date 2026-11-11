import type {
  KnowledgeDocument,
  KnowledgeManagementPort,
  KnowledgeMutationActor,
  SetKnowledgeDocumentAgentInput,
  UpdateKnowledgeDocumentInput,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { setKnowledgeDocumentAgent, updateKnowledgeDocument } from './knowledge-document-edit.js';
import {
  deleteKnowledgeDocument,
  restoreKnowledgeDocument,
} from './knowledge-document-lifecycle.js';

/** Gestão de documentos da Base de Conhecimento (DEC-054), sempre escopada à organização. */
export class DrizzleKnowledgeManagementService implements KnowledgeManagementPort {
  constructor(private readonly db: DatabaseInstance) {}

  updateDocument(input: UpdateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    return updateKnowledgeDocument(this.db, input);
  }

  setDocumentAgent(input: SetKnowledgeDocumentAgentInput): Promise<KnowledgeDocument> {
    return setKnowledgeDocumentAgent(this.db, input);
  }

  restoreDocument(input: KnowledgeMutationActor): Promise<KnowledgeDocument> {
    return restoreKnowledgeDocument(this.db, input);
  }

  deleteDocument(input: KnowledgeMutationActor): Promise<void> {
    return deleteKnowledgeDocument(this.db, input);
  }
}
