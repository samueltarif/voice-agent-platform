import { z } from 'zod';
import type { KnowledgeSourceType } from './knowledge-document-contracts.js';
import type { KnowledgeHitRelevance } from './knowledge-retrieval-contracts.js';

/**
 * Pré-visualização OFFLINE da recuperação de conhecimento (DEC-055): mostra quais
 * trechos um agente receberia para uma pergunta, sem IA, sem chamada e sem Millis.
 * O texto devolvido é DADO não confiável; nunca é instrução para o agente.
 */
export const KNOWLEDGE_PREVIEW_MAX_QUERY_CHARS = 500;
export const KNOWLEDGE_PREVIEW_MAX_TOP_K = 10;
export const KNOWLEDGE_PREVIEW_DEFAULT_TOP_K = 5;
/** Mesmo limite por trecho do envelope de voz (VOICE_KNOWLEDGE_MAX_EXCERPT_CHARS). */
export const KNOWLEDGE_PREVIEW_MAX_EXCERPT_CHARS = 500;

export const knowledgeRetrievalPreviewHttpBodySchema = z
  .object({
    queryText: z.string().trim().min(1).max(KNOWLEDGE_PREVIEW_MAX_QUERY_CHARS),
    /** Sem agente: visão administrativa de todos os documentos prontos da organização. */
    agentId: z.string().uuid().optional(),
    topK: z.number().int().min(1).max(KNOWLEDGE_PREVIEW_MAX_TOP_K).optional(),
  })
  .strict();

export type KnowledgeRetrievalPreviewHttpBody = z.infer<
  typeof knowledgeRetrievalPreviewHttpBodySchema
>;

export interface KnowledgeRetrievalPreviewHit {
  readonly citationId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly chunkOrdinal: number;
  readonly sourceType: KnowledgeSourceType;
  readonly sourceLocator: string;
  readonly excerpt: string;
  readonly score: number;
  /** DIRECT = contém o assunto da pergunta; CONTEXT = só informação geral (preço, prazo…). */
  readonly relevance?: KnowledgeHitRelevance | undefined;
}

export interface KnowledgeRetrievalPreview {
  readonly trust: 'UNTRUSTED_DATA';
  /** AGENT = escopo de uma chamada (agente ativo + versão publicada). */
  readonly mode: 'AGENT' | 'ORGANIZATION';
  readonly agentId?: string | undefined;
  readonly agentVersionId?: string | undefined;
  /** Termos normalizados usados na busca (sem acento, singular, sem palavras vazias). */
  readonly terms: readonly string[];
  /** Termos centrais sem correspondência: não há evidência sobre eles nos documentos. */
  readonly unmatchedTerms?: readonly string[] | undefined;
  readonly hits: readonly KnowledgeRetrievalPreviewHit[];
  readonly truncated: boolean;
}

export interface KnowledgeRetrievalPreviewInput {
  readonly organizationId: string;
  readonly queryText: string;
  readonly agentId?: string | undefined;
  readonly topK?: number | undefined;
}

export interface KnowledgeRetrievalPreviewPort {
  preview(input: KnowledgeRetrievalPreviewInput): Promise<KnowledgeRetrievalPreview>;
}

export const KNOWLEDGE_PREVIEW_ERROR_CODES = {
  AGENT_UNAVAILABLE: 'KNOWLEDGE_AGENT_UNAVAILABLE',
  AGENT_NOT_PUBLISHED: 'KNOWLEDGE_AGENT_NOT_PUBLISHED',
} as const;
