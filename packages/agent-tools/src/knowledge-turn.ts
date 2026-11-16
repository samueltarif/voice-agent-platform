import {
  KNOWLEDGE_SEARCH_TOOL_NAME,
  knowledgeSearchToolOutputSchema,
  type KnowledgeSearchToolOutput,
  type SimulatedKnowledgeEvidence,
  type SimulatedKnowledgeTurn,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolRegistryPort,
} from '@voice-agent/contracts';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import type { ToolAuthorizer } from './tool-authorization.js';

/**
 * Núcleo do turno simulado (DEC-060, movido na DEC-061): a pergunta vai inteira
 * para `knowledge.search` pelo motor de ferramentas; a resposta usa só textos
 * fixos e cita os trechos como dados entre aspas, numa linha cada. Quem chama
 * fornece o contexto e o autorizador montados NO SERVIDOR (concessão da
 * chamada em `apps/voice`; versão publicada lida do banco em `apps/api`).
 */
export interface KnowledgeTurnInput {
  readonly registry: ToolRegistryPort;
  readonly isToolAllowed: ToolAuthorizer;
  readonly context: ToolExecutionContext;
  readonly utterance: string;
}

export const SIMULATED_REPLY = {
  notEnabled: 'A consulta aos documentos não está habilitada na versão publicada deste agente.',
  failed: 'Não foi possível consultar os documentos da empresa agora.',
  noEvidence: 'Não encontrei essa informação nos documentos da empresa.',
  found: 'Encontrei nos documentos da empresa:',
  context: 'Informação geral (não confirma o item perguntado):',
} as const;

/** Uma linha por trecho: quebras de linha do documento não viram linhas da resposta. */
const quote = (e: SimulatedKnowledgeEvidence, n: number) =>
  `[${n}] "${e.excerpt.replace(/\s+/g, ' ').trim()}" (${e.documentTitle.replace(/\s+/g, ' ')})`;

function missingSentence(terms: readonly string[]): string {
  return `Não encontrei menção a ${terms.join(', ')} nos documentos da empresa; não posso confirmar que a empresa ofereça isso.`;
}

function composeAnswer(
  evidence: readonly SimulatedKnowledgeEvidence[],
  unmatched: readonly string[],
): string {
  const numbered = evidence.map((e, i) => ({ e, line: quote(e, i + 1) }));
  const direct = numbered.filter((x) => x.e.relevance === 'DIRECT').map((x) => x.line);
  const context = numbered.filter((x) => x.e.relevance === 'CONTEXT').map((x) => x.line);
  const lines = [SIMULATED_REPLY.found, ...direct];
  if (context.length > 0) lines.push(SIMULATED_REPLY.context, ...context);
  if (unmatched.length > 0) lines.push(missingSentence(unmatched));
  return lines.join('\n');
}

function fromOutput(output: KnowledgeSearchToolOutput): SimulatedKnowledgeTurn {
  const evidence = output.results.map((r) => ({
    citationId: r.citationId,
    documentTitle: r.documentTitle,
    relevance: r.relevance,
    excerpt: r.excerpt,
  }));
  const unmatchedTerms = [...output.unmatchedTerms];
  if (!output.found) {
    const replyText =
      unmatchedTerms.length > 0 ? missingSentence(unmatchedTerms) : SIMULATED_REPLY.noEvidence;
    return { outcome: 'NO_EVIDENCE', replyText, evidence: [], unmatchedTerms };
  }
  const replyText = composeAnswer(evidence, unmatchedTerms);
  return { outcome: 'ANSWERED_WITH_EVIDENCE', replyText, evidence, unmatchedTerms };
}

const withoutEvidence = (outcome: 'TOOL_NOT_ENABLED' | 'TOOL_FAILED'): SimulatedKnowledgeTurn => ({
  outcome,
  replyText: outcome === 'TOOL_NOT_ENABLED' ? SIMULATED_REPLY.notEnabled : SIMULATED_REPLY.failed,
  evidence: [],
  unmatchedTerms: [],
});

function toTurn(result: ToolExecutionResult): SimulatedKnowledgeTurn {
  if (result.status === 'REJECTED' && result.reason !== 'INVALID_ARGUMENTS') {
    return withoutEvidence('TOOL_NOT_ENABLED');
  }
  if (result.status !== 'SUCCESS') return withoutEvidence('TOOL_FAILED');
  // Saída fora do contrato (DIRECT/CONTEXT, limites) nunca chega à resposta.
  const parsed = knowledgeSearchToolOutputSchema.safeParse(result.output);
  return parsed.success ? fromOutput(parsed.data) : withoutEvidence('TOOL_FAILED');
}

/** Executa um turno; o motor é criado aqui com o autorizador recebido do servidor. */
export async function runKnowledgeTurn(input: KnowledgeTurnInput): Promise<SimulatedKnowledgeTurn> {
  const engine = new ToolExecutionEngine({
    registry: input.registry,
    isToolAllowed: input.isToolAllowed,
  });
  const result = await engine.executeTool(
    { toolName: KNOWLEDGE_SEARCH_TOOL_NAME, rawArguments: { query: input.utterance } },
    input.context,
  );
  return toTurn(result);
}
