import {
  KNOWLEDGE_SEARCH_TOOL_NAME,
  knowledgeSearchV2ToolOutputSchema,
  type KnowledgeAgentProjection,
  type SimulatedKnowledgeTurn,
  type ToolExecutionResult,
} from '@voice-agent/contracts';
import { SIMULATED_REPLY, type KnowledgeTurnInput } from './knowledge-turn.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';

/**
 * Turno simulado de versões com perfil `v2` (B2a, DEC-071). Mínimo e
 * determinístico: frases FIXAS do servidor + fatos estruturados da projeção
 * sanitizada (B2b). Nunca trecho, título ou texto de documento; nunca v1. A
 * resposta natural para voz é da B2c; o seletor e a simulação completa, da B2d.
 */
export const SIMULATED_REPLY_V2 = {
  facts: 'Encontrei informações técnicas nos documentos da empresa.',
  noFacts: 'Encontrei referências nos documentos, mas sem dados técnicos que eu possa confirmar.',
  authorizedSource:
    'Preço, estoque, prazo, pagamento e garantia precisam ser confirmados com a equipe da empresa.',
  unavailable: 'Não consigo consultar os documentos agora.',
} as const;

const PROFILE_UNAVAILABLE: SimulatedKnowledgeTurn = Object.freeze({
  outcome: 'PROFILE_UNAVAILABLE',
  replyText: SIMULATED_REPLY_V2.unavailable,
  evidence: [],
  unmatchedTerms: [],
});

function mainSentence(p: KnowledgeAgentProjection): string {
  if (p.facts.length > 0) return SIMULATED_REPLY_V2.facts;
  return p.found ? SIMULATED_REPLY_V2.noFacts : SIMULATED_REPLY.noEvidence;
}

function fromProjection(p: KnowledgeAgentProjection): SimulatedKnowledgeTurn {
  const aspects = [...p.aspectsRequiringAuthorizedSource];
  const lines = [mainSentence(p)];
  if (aspects.length > 0) lines.push(SIMULATED_REPLY_V2.authorizedSource);
  return {
    outcome: p.facts.length > 0 ? 'ANSWERED_WITH_FACTS' : 'NO_EVIDENCE',
    replyText: lines.join('\n'),
    evidence: [],
    unmatchedTerms: [...p.unmatchedTerms],
    facts: [...p.facts],
    aspectsRequiringAuthorizedSource: aspects,
  };
}

function toTurnV2(result: ToolExecutionResult): SimulatedKnowledgeTurn {
  if (result.status === 'REJECTED' && result.reason !== 'INVALID_ARGUMENTS') {
    return {
      outcome: 'TOOL_NOT_ENABLED',
      replyText: SIMULATED_REPLY.notEnabled,
      evidence: [],
      unmatchedTerms: [],
    };
  }
  if (result.status !== 'SUCCESS') return PROFILE_UNAVAILABLE;
  // Saída fora do contrato v2 (inclusive formato v1 com trechos) = falha controlada.
  const parsed = knowledgeSearchV2ToolOutputSchema.safeParse(result.output);
  if (!parsed.success || parsed.data.status !== 'OK') return PROFILE_UNAVAILABLE;
  return fromProjection(parsed.data.projection);
}

export async function runKnowledgeTurnV2(
  input: KnowledgeTurnInput,
): Promise<SimulatedKnowledgeTurn> {
  const engine = new ToolExecutionEngine({
    registry: input.registry,
    isToolAllowed: input.isToolAllowed,
  });
  const result = await engine.executeTool(
    { toolName: KNOWLEDGE_SEARCH_TOOL_NAME, rawArguments: { query: input.utterance } },
    input.context,
  );
  return toTurnV2(result);
}
