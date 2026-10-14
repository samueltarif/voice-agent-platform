import type { KnowledgeDocumentStatus } from '@voice-agent/contracts';

export interface KnowledgeFilters {
  readonly status: KnowledgeDocumentStatus | '';
  readonly collection: string;
}
