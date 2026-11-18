import {
  KNOWLEDGE_SEARCH_TOOL_NAME,
  knowledgeSearchV2ToolOutputSchema,
  type KnowledgeAgentProjection,
  type KnowledgeVoiceReply,
  type SimulatedKnowledgeTurn,
  type ToolExecutionResult,
} from '@voice-agent/contracts';
import { SIMULATED_REPLY, type KnowledgeTurnInput } from './knowledge-turn.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';

/**
 * Turno simulado de versões com perfil `v2` (B2a, DEC-071; B2c, DEC-072).
 * Determinístico: a resposta é EXATAMENTE `reply.spokenText`, composta e
 * verificada pela ferramenta v2 a partir da projeção sanitizada (B2b). Nunca
 * trecho, título ou texto de documento; nunca v1. O seletor e a simulação
 * completa são da B2d; a voz e a telefonia NÃO usam este turno.
 */
export const SIMULATED_REPLY_V2 = {
  unavailable: 'Não consigo consultar os documentos agora.',
} as const;

const PROFILE_UNAVAILABLE: SimulatedKnowledgeTurn = Object.freeze({
  outcome: 'PROFILE_UNAVAILABLE',
  replyText: SIMULATED_REPLY_V2.unavailable,
  evidence: [],
  unmatchedTerms: [],
});

function fromProjection(p: KnowledgeAgentProjection, reply: KnowledgeVoiceReply) {
  const aspects = [...p.aspectsRequiringAuthorizedSource];
  const turn: SimulatedKnowledgeTurn = {
    outcome: p.facts.length > 0 ? 'ANSWERED_WITH_FACTS' : 'NO_EVIDENCE',
    replyText: reply.spokenText,
    evidence: [],
    unmatchedTerms: [...p.unmatchedTerms],
    facts: [...p.facts],
    aspectsRequiringAuthorizedSource: aspects,
  };
  return turn;
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
  return fromProjection(parsed.data.projection, parsed.data.reply);
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
