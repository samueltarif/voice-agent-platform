import { z } from 'zod';
import { KNOWLEDGE_MAX_QUERY_TERMS } from './knowledge-query-terms.js';
import {
  KNOWLEDGE_SEARCH_MAX_EXCERPT_CHARS,
  KNOWLEDGE_SEARCH_MAX_RESULTS,
  KNOWLEDGE_SEARCH_MAX_TITLE_CHARS,
  knowledgeSearchToolInputSchema,
} from './knowledge-search-tool-contracts.js';

/**
 * Turno de conversa SIMULADO e determinístico com `knowledge.search`
 * (DEC-060/DEC-061): sem IA, voz ou provedor. A resposta é montada com textos
 * fixos do servidor e cita os trechos (dados não confiáveis) entre aspas.
 */
export const SIMULATED_KNOWLEDGE_TURN_OUTCOMES = [
  'ANSWERED_WITH_EVIDENCE',
  'NO_EVIDENCE',
  'TOOL_NOT_ENABLED',
  'TOOL_FAILED',
] as const;

/** Teto da resposta: trechos (≤ 2.000) + títulos + cabeçalhos + termos ausentes. */
export const SIMULATED_KNOWLEDGE_REPLY_MAX_CHARS = 6000;

export const simulatedKnowledgeEvidenceSchema = z
  .object({
    citationId: z.string().min(1).max(200),
    documentTitle: z.string().max(KNOWLEDGE_SEARCH_MAX_TITLE_CHARS),
    relevance: z.enum(['DIRECT', 'CONTEXT']),
    excerpt: z.string().max(KNOWLEDGE_SEARCH_MAX_EXCERPT_CHARS + 2),
  })
  .strict();

export const simulatedKnowledgeTurnSchema = z
  .object({
    outcome: z.enum(SIMULATED_KNOWLEDGE_TURN_OUTCOMES),
    replyText: z.string().min(1).max(SIMULATED_KNOWLEDGE_REPLY_MAX_CHARS),
    evidence: z.array(simulatedKnowledgeEvidenceSchema).max(KNOWLEDGE_SEARCH_MAX_RESULTS),
    unmatchedTerms: z.array(z.string().min(1).max(64)).max(KNOWLEDGE_MAX_QUERY_TERMS),
  })
  .strict();

export type SimulatedKnowledgeTurnOutcome = (typeof SIMULATED_KNOWLEDGE_TURN_OUTCOMES)[number];
export type SimulatedKnowledgeEvidence = z.infer<typeof simulatedKnowledgeEvidenceSchema>;
export type SimulatedKnowledgeTurn = z.infer<typeof simulatedKnowledgeTurnSchema>;

/**
 * Corpo vindo do navegador: só o agente escolhido e a pergunta. Organização,
 * versão e permissões são resolvidas no servidor; o agente é revalidado
 * (ativo, da organização da sessão, com versão publicada).
 */
export const knowledgeSimulatedTurnHttpBodySchema = z
  .object({
    agentId: z.string().uuid(),
    utterance: knowledgeSearchToolInputSchema.shape.query,
  })
  .strict();

export type KnowledgeSimulatedTurnHttpBody = z.infer<typeof knowledgeSimulatedTurnHttpBodySchema>;

export const knowledgeSimulatedTurnResponseSchema = z
  .object({
    agent: z
      .object({
        agentId: z.string().uuid(),
        name: z.string().max(200),
        agentVersionId: z.string().uuid(),
        versionNumber: z.number().int().positive(),
      })
      .strict(),
    turn: simulatedKnowledgeTurnSchema,
  })
  .strict();

export type KnowledgeSimulatedTurnResponse = z.infer<typeof knowledgeSimulatedTurnResponseSchema>;
