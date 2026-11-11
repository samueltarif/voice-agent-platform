import { z } from 'zod';
import type { KnowledgeDocument, KnowledgeDocumentStatus } from './knowledge-document-contracts.js';

/** Aceita tanto o domínio (`undefined`) quanto a resposta HTTP (`null`). */
interface KnowledgeScopeFields {
  readonly status: KnowledgeDocumentStatus;
  readonly agentId?: string | null | undefined;
  readonly agentVersionId?: string | null | undefined;
}

/**
 * Gestão de documentos já cadastrados (DEC-054): edição, associação a agente,
 * restauração e exclusão definitiva. O arquivamento continua em
 * `KnowledgeRepositoryPort.archiveDocument` (agora com auditoria opcional). Toda mutação exige `expectedUpdatedAt`
 * (concorrência otimista) para nunca sobrescrever uma alteração mais recente.
 */
const expectedUpdatedAtSchema = z.string().datetime();

export const updateKnowledgeDocumentHttpBodySchema = z
  .object({
    expectedUpdatedAt: expectedUpdatedAtSchema,
    title: z.string().trim().min(1).max(200).optional(),
    /** `null` remove a coleção. */
    collection: z.string().trim().min(1).max(100).nullable().optional(),
    /** `null` remove a versão da fonte. */
    sourceVersion: z.string().trim().min(1).max(100).nullable().optional(),
    /** Substitui o conteúdo inteiro (o texto original não é devolvido pela API). */
    rawText: z.string().min(1).max(200_000).optional(),
  })
  .strict();

export type UpdateKnowledgeDocumentHttpBody = z.infer<typeof updateKnowledgeDocumentHttpBodySchema>;

export const associateKnowledgeDocumentHttpBodySchema = z
  .object({
    expectedUpdatedAt: expectedUpdatedAtSchema,
    /** `null` = disponível para todos os agentes da organização. */
    agentId: z.string().uuid().nullable(),
  })
  .strict();

export type AssociateKnowledgeDocumentHttpBody = z.infer<
  typeof associateKnowledgeDocumentHttpBodySchema
>;

export const knowledgeLifecycleHttpBodySchema = z
  .object({ expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

export type KnowledgeLifecycleHttpBody = z.infer<typeof knowledgeLifecycleHttpBodySchema>;

/** Códigos de erro estáveis, traduzidos para mensagens seguras pelo BFF. */
export const KNOWLEDGE_MANAGEMENT_ERROR_CODES = {
  STALE: 'KNOWLEDGE_STALE_UPDATE',
  NO_CHANGES: 'KNOWLEDGE_NO_CHANGES',
  NOT_EDITABLE: 'KNOWLEDGE_NOT_EDITABLE',
  PINNED: 'KNOWLEDGE_PINNED_TO_AGENT_VERSION',
  AGENT_UNAVAILABLE: 'KNOWLEDGE_AGENT_UNAVAILABLE',
  NOT_RESTORABLE: 'KNOWLEDGE_NOT_RESTORABLE',
  IN_USE: 'KNOWLEDGE_DOCUMENT_IN_USE',
} as const;

export function hasKnowledgeDocumentChanges(body: UpdateKnowledgeDocumentHttpBody): boolean {
  return (
    body.title !== undefined ||
    body.collection !== undefined ||
    body.sourceVersion !== undefined ||
    body.rawText !== undefined
  );
}

/** Documento fixado a uma versão de agente: só pode ser arquivado (preserva a versão). */
export function isPinnedToAgentVersion(doc: Pick<KnowledgeScopeFields, 'agentVersionId'>): boolean {
  return typeof doc.agentVersionId === 'string' && doc.agentVersionId.length > 0;
}

/** Edição e associação: apenas documentos prontos e não fixados a uma versão. */
export function isKnowledgeDocumentManageable(
  doc: Pick<KnowledgeScopeFields, 'status' | 'agentVersionId'>,
): boolean {
  return doc.status === 'READY' && !isPinnedToAgentVersion(doc);
}

/**
 * Exclusão definitiva: só arquivado, sem agente e sem versão associados.
 * A remoção apaga os trechos (cascade); a trilha de auditoria permanece.
 */
export function isKnowledgeDocumentDeletable(doc: KnowledgeScopeFields): boolean {
  return doc.status === 'ARCHIVED' && !doc.agentId && !isPinnedToAgentVersion(doc);
}

export function isKnowledgeDocumentRestorable(status: KnowledgeDocumentStatus): boolean {
  return status === 'ARCHIVED';
}

export interface KnowledgeMutationActor {
  readonly organizationId: string;
  readonly documentId: string;
  readonly actorId: string;
  readonly expectedUpdatedAt: string;
}

export interface UpdateKnowledgeDocumentInput extends KnowledgeMutationActor {
  readonly title?: string | undefined;
  readonly collection?: string | null | undefined;
  readonly sourceVersion?: string | null | undefined;
  readonly rawText?: string | undefined;
}

export interface SetKnowledgeDocumentAgentInput extends KnowledgeMutationActor {
  readonly agentId: string | null;
}

/** Porta de gestão; isolamento por organização é obrigatório em toda operação. */
export interface KnowledgeManagementPort {
  updateDocument(input: UpdateKnowledgeDocumentInput): Promise<KnowledgeDocument>;
  setDocumentAgent(input: SetKnowledgeDocumentAgentInput): Promise<KnowledgeDocument>;
  restoreDocument(input: KnowledgeMutationActor): Promise<KnowledgeDocument>;
  deleteDocument(input: KnowledgeMutationActor): Promise<void>;
}
