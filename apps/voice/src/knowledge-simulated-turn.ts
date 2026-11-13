import {
  KNOWLEDGE_SEARCH_TOOL_NAME,
  knowledgeSearchToolOutputSchema,
  type KnowledgeHitRelevance,
  type KnowledgeSearchToolOutput,
  type ToolExecutionResult,
  type ToolRegistryPort,
} from '@voice-agent/contracts';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import type { PublishedToolGrant } from './published-tool-grant.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';

/**
 * KB-SIM-1 (DEC-060): um turno de conversa SIMULADO, determinístico e offline.
 * Sem IA: a pergunta vai inteira para `knowledge.search`, executada pelo motor
 * de ferramentas com o autorizador da concessão da versão publicada (mesmo
 * caminho de uma chamada). A resposta usa só textos fixos e cita os trechos
 * como dados entre aspas; nada do documento é interpretado como instrução.
 * NÃO registrado em composição de produção.
 */
export type SimulatedKnowledgeTurnOutcome =
  'ANSWERED_WITH_EVIDENCE' | 'NO_EVIDENCE' | 'TOOL_NOT_ENABLED' | 'TOOL_FAILED';

export interface SimulatedKnowledgeEvidence {
  readonly citationId: string;
  readonly documentTitle: string;
  readonly relevance: KnowledgeHitRelevance;
  readonly excerpt: string;
}

export interface SimulatedKnowledgeTurn {
  readonly outcome: SimulatedKnowledgeTurnOutcome;
  readonly replyText: string;
  readonly evidence: readonly SimulatedKnowledgeEvidence[];
  readonly unmatchedTerms: readonly string[];
}

export interface SimulatedKnowledgeTurnInput {
  /** Concessão emitida pelo `CallLifecycleGateway` (única fonte do contexto). */
  readonly grant: PublishedToolGrant;
  readonly registry: ToolRegistryPort;
  readonly utterance: string;
  readonly turnId?: string | undefined;
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
) {
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
  const unmatchedTerms = output.unmatchedTerms;
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

/**
 * Executa um turno. O motor é criado aqui com o autorizador da concessão: quem
 * chama não escolhe autorizador, organização, agente ou versão. Concessão não
 * emitida pelo gateway lança erro (fail-closed).
 */
export async function runSimulatedKnowledgeTurn(
  input: SimulatedKnowledgeTurnInput,
): Promise<SimulatedKnowledgeTurn> {
  const context = buildPublishedVersionToolExecutionContext(
    input.grant,
    input.turnId !== undefined ? { turnId: input.turnId } : {},
  );
  const engine = new ToolExecutionEngine({
    registry: input.registry,
    isToolAllowed: createPublishedVersionToolAuthorizer(input.grant),
  });
  const result = await engine.executeTool(
    { toolName: KNOWLEDGE_SEARCH_TOOL_NAME, rawArguments: { query: input.utterance } },
    context,
  );
  return toTurn(result);
}
