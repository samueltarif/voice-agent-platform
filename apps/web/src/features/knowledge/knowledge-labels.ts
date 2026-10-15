import type { KnowledgeDocumentStatus, KnowledgeSourceType } from '@voice-agent/contracts';

export const SOURCE_TYPE_LABELS: Readonly<Record<KnowledgeSourceType, string>> = {
  MANUAL_UPLOAD: 'Cadastro manual',
  PRODUCT_MANUAL: 'Manual de produto',
  FAQ: 'Perguntas frequentes (FAQ)',
  POLICY: 'Política',
  SALES_SCRIPT: 'Roteiro de vendas',
  HELP_CENTER_IMPORT: 'Central de ajuda',
  OTHER: 'Outro',
};

export const STATUS_LABELS: Readonly<Record<KnowledgeDocumentStatus, string>> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  READY: 'Pronto',
  FAILED: 'Falhou',
  ARCHIVED: 'Arquivado',
};

export const KNOWLEDGE_LIMITS = {
  title: 200,
  locator: 1000,
  rawText: 200_000,
  collection: 100,
  pageSize: 20,
} as const;
