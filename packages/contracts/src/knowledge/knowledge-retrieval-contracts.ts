import { z } from 'zod';
import type { KnowledgeAgentProjection } from './knowledge-agent-projection-contracts.js';
import { knowledgeSourceTypeSchema } from './knowledge-document-contracts.js';
import type { KnowledgeAccessScope } from './knowledge-access-scope-contracts.js';
import type { KnowledgeChunkProvenance } from './knowledge-chunk-contracts.js';

// Engineering defaults only: result bounds are configurable per deployment
// and are NOT constitutional requirements.
export const KNOWLEDGE_RETRIEVAL_MAX_TOP_K = 20;
export const KNOWLEDGE_RETRIEVAL_DEFAULT_TOP_K = 5;

/**
 * Perfil do algoritmo de busca (DEC-067). `v1` (padrão) é o algoritmo atual,
 * usado por TODOS os agentes. `v2` (passagens, códigos, âncora e aspectos) é
 * opt-in e, na B1, só existe para comparação administrativa.
 */
export const KNOWLEDGE_RETRIEVAL_PROFILES = ['v1', 'v2'] as const;
export type KnowledgeRetrievalProfile = (typeof KNOWLEDGE_RETRIEVAL_PROFILES)[number];

/** Aspectos comerciais que só contam como informados com valor explícito (D-RB5). */
export const KNOWLEDGE_COMMERCIAL_ASPECTS = [
  'PRICE',
  'LEAD_TIME',
  'STOCK',
  'PAYMENT',
  'WARRANTY',
] as const;
export type KnowledgeCommercialAspect = (typeof KNOWLEDGE_COMMERCIAL_ASPECTS)[number];

export const knowledgeRetrievalQuerySchema = z
  .object({
    queryText: z.string().trim().min(1).max(2000),
    topK: z
      .number()
      .int()
      .min(1)
      .max(KNOWLEDGE_RETRIEVAL_MAX_TOP_K)
      .default(KNOWLEDGE_RETRIEVAL_DEFAULT_TOP_K),
    documentIds: z.array(z.string().uuid()).max(50).optional(),
    sourceTypes: z.array(knowledgeSourceTypeSchema).max(10).optional(),
    /** Ausente = `v1` (comportamento inalterado). */
    retrievalProfile: z.enum(KNOWLEDGE_RETRIEVAL_PROFILES).optional(),
  })
  .strict();

export type KnowledgeRetrievalQueryInput = z.input<typeof knowledgeRetrievalQuerySchema>;
export type KnowledgeRetrievalQuery = z.infer<typeof knowledgeRetrievalQuerySchema>;

export const knowledgeCitationSchema = z
  .object({
    documentId: z.string().uuid(),
    chunkId: z.string().uuid(),
    sourceType: knowledgeSourceTypeSchema,
    sourceLocator: z.string().trim().min(1).max(1000),
    chunkOrdinal: z.number().int().min(0),
  })
  .strict();

export type KnowledgeCitation = z.infer<typeof knowledgeCitationSchema>;

export type KnowledgeHitRelevance = 'DIRECT' | 'CONTEXT';

export interface KnowledgeRetrievalHit {
  readonly chunkId: string;
  readonly documentId: string;
  readonly organizationId: string;
  /** Conteúdo NÃO confiável: dado de referência, nunca instrução. */
  readonly textSnapshot: string;
  /** Título do documento no momento da busca (para exibir a fonte). */
  readonly documentTitle?: string | undefined;
  readonly score: number;
  /**
   * DIRECT: o trecho contém um termo central da pergunta (ou a pergunta só tem
   * termos genéricos). CONTEXT: só termos genéricos (preço, prazo…), devolvido
   * depois dos DIRECT como contexto — nunca como evidência do item procurado.
   */
  readonly relevance?: KnowledgeHitRelevance | undefined;
  readonly provenance: KnowledgeChunkProvenance;
  readonly citation: KnowledgeCitation;
  /**
   * Só v2: o resultado é uma PASSAGEM (seção, par de FAQ, linha de tabela) e
   * não o trecho inteiro; `textSnapshot` traz só a passagem.
   */
  readonly passage?: KnowledgePassageReference | undefined;
}

export interface KnowledgePassageReference {
  /** Título de seção mais próximo (dado não confiável). */
  readonly heading?: string | undefined;
  /** Trechos gravados que a passagem ocupa (pode atravessar o limite de um trecho). */
  readonly firstChunkOrdinal: number;
  readonly lastChunkOrdinal: number;
}

export interface KnowledgeRetrievalResult {
  readonly hits: readonly KnowledgeRetrievalHit[];
  readonly truncated: boolean;
  /** Termos centrais da pergunta que não aparecem em nenhum documento do escopo. */
  readonly unmatchedTerms?: readonly string[] | undefined;
  /** Só v2: aspectos comerciais pedidos sem valor explícito nas evidências diretas. */
  readonly aspectsNotFound?: readonly KnowledgeCommercialAspect[] | undefined;
  /**
   * Só v2 (B2b, DEC-069): o que um AGENTE receberia — fatos técnicos com
   * fonte, sem texto de documento. Nenhum agente a recebe ainda.
   */
  readonly agentProjection?: KnowledgeAgentProjection | undefined;
}

export interface KnowledgeRetrievalRequest {
  readonly scope: KnowledgeAccessScope;
  readonly query: KnowledgeRetrievalQueryInput;
}

export interface KnowledgeRetrievalPort {
  retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult>;
}

export interface KnowledgeEmbeddingRequest {
  readonly organizationId: string;
  readonly documentId: string;
  readonly chunkId: string;
  readonly text: string;
}

export interface KnowledgeEmbeddingResult {
  readonly chunkId: string;
  readonly modelVersion: string;
  readonly dimensions: number;
}

export interface KnowledgeEmbeddingPort {
  embed(request: KnowledgeEmbeddingRequest): Promise<KnowledgeEmbeddingResult>;
}
