import { z } from 'zod';
import type { KnowledgeSourceType } from './knowledge-document-contracts.js';
import type { KnowledgeAgentProjection } from './knowledge-agent-projection-contracts.js';
import type {
  KnowledgeCommercialAspect,
  KnowledgeHitRelevance,
  KnowledgeRetrievalProfile,
} from './knowledge-retrieval-contracts.js';

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
  /** Só v2: título da seção da passagem (dado não confiável). */
  readonly passageHeading?: string | undefined;
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
  /** Só na comparação (DEC-067): algoritmo que produziu esta lista. */
  readonly retrievalProfile?: KnowledgeRetrievalProfile | undefined;
  /** Só v2: aspectos comerciais pedidos sem valor explícito nas evidências diretas. */
  readonly aspectsNotFound?: readonly KnowledgeCommercialAspect[] | undefined;
  /**
   * Só v2, só na comparação ADMINISTRATIVA (B2b, DEC-069): passagens relevantes
   * marcadas pelo detector auxiliar. Nunca são evidência nem chegam ao agente.
   */
  readonly suspiciousPassages?: readonly KnowledgeSuspiciousPreviewPassage[] | undefined;
  /** Só v2: o que o agente receberia (fatos técnicos com fonte; sem texto de documento). */
  readonly agentProjection?: KnowledgeAgentProjection | undefined;
}

export const KNOWLEDGE_HOSTILE_SIGNALS = [
  'ASSISTANT_COMMAND',
  'ROLE_MARKER',
  'AUTHORITY_CLAIM',
] as const;
export type KnowledgeHostileSignal = (typeof KNOWLEDGE_HOSTILE_SIGNALS)[number];

export interface KnowledgeSuspiciousPreviewPassage {
  readonly citationId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly chunkOrdinal: number;
  readonly sourceType: KnowledgeSourceType;
  /** Texto do documento (dado não confiável), exibido escapado só ao OWNER/ADMIN. */
  readonly excerpt: string;
  readonly passageHeading?: string | undefined;
  readonly signals: readonly KnowledgeHostileSignal[];
}

/**
 * Comparação ADMINISTRATIVA v1 × v2 (DEC-067, PR B1): mesma pergunta, mesmo
 * escopo (organização da asserção; agente ativo + versão publicada quando
 * informado). Não muda o que nenhum agente usa: todos continuam na v1.
 */
export const knowledgeRetrievalComparisonHttpBodySchema = knowledgeRetrievalPreviewHttpBodySchema;

export interface KnowledgeRetrievalComparison {
  readonly trust: 'UNTRUSTED_DATA';
  readonly v1: KnowledgeRetrievalPreview;
  readonly v2: KnowledgeRetrievalPreview;
}

export interface KnowledgeRetrievalComparisonPort {
  compare(input: KnowledgeRetrievalPreviewInput): Promise<KnowledgeRetrievalComparison>;
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
