import { z } from 'zod';
import type { KnowledgeAccessScope } from './knowledge-access-scope-contracts.js';
import {
  knowledgeAgentProjectionSchema,
  type KnowledgeAgentProjection,
} from './knowledge-agent-projection-contracts.js';
import { knowledgeSearchToolOutputSchema } from './knowledge-search-tool-contracts.js';

/**
 * B2a (DEC-071) — saída de `knowledge.search` para versões com perfil `v2`.
 *
 * NÃO há campo de trecho, título ou texto de documento: o ramo `v2` carrega só
 * a projeção sanitizada da B2b (fatos técnicos com fonte, aspectos que exigem
 * fonte autorizada, contadores e `usage` fixo). Indisponível (travas, erro,
 * tempo esgotado ou projeção inválida) = falha controlada, SEM conteúdo e SEM
 * fallback para a v1. O contrato da v1 não muda.
 */
export const KNOWLEDGE_SEARCH_V2_SIMULATION_TIMEOUT_MS = 2000;
/** Consultas v2 simultâneas por processo (a consulta pode seguir após o tempo limite). */
export const KNOWLEDGE_SEARCH_V2_MAX_CONCURRENCY = 4;

export const knowledgeSearchV2ToolOutputSchema = z.discriminatedUnion('status', [
  z
    .object({
      trust: z.literal('UNTRUSTED_DATA'),
      retrievalProfile: z.literal('v2'),
      status: z.literal('OK'),
      projection: knowledgeAgentProjectionSchema,
    })
    .strict(),
  z
    .object({
      trust: z.literal('UNTRUSTED_DATA'),
      retrievalProfile: z.literal('v2'),
      status: z.literal('KNOWLEDGE_PROFILE_UNAVAILABLE'),
    })
    .strict(),
]);

export type KnowledgeSearchV2ToolOutput = z.infer<typeof knowledgeSearchV2ToolOutputSchema>;

/** Qualquer saída válida da ferramenta: v1 (inalterada) OU v2 (sem trechos). */
export const knowledgeSearchAnyToolOutputSchema = z.union([
  knowledgeSearchToolOutputSchema,
  knowledgeSearchV2ToolOutputSchema,
]);

/** Motivo interno da indisponibilidade (só para log e métrica; nunca vai ao agente). */
export type KnowledgeSearchV2UnavailableReason =
  | 'RUNTIME_OFF'
  | 'ORG_NOT_ALLOWED'
  | 'BINDING_MISMATCH'
  | 'BUSY'
  | 'TIMEOUT'
  | 'ERROR'
  | 'INVALID_PROJECTION';

export interface KnowledgeAgentProjectionRequest {
  readonly scope: KnowledgeAccessScope;
  readonly queryText: string;
  readonly topK: number;
}

/** Única fonte do ramo `v2`: devolve SÓ a projeção sanitizada (nunca hits brutos). */
export interface KnowledgeAgentProjectionPort {
  project(request: KnowledgeAgentProjectionRequest): Promise<KnowledgeAgentProjection>;
}
