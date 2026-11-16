import type { SimulatedKnowledgeTurn, ToolRegistryPort } from '@voice-agent/contracts';
import { runKnowledgeTurn } from '@voice-agent/agent-tools';
import type { PublishedToolGrant } from './published-tool-grant.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';

export { SIMULATED_REPLY } from '@voice-agent/agent-tools';
export type {
  SimulatedKnowledgeEvidence,
  SimulatedKnowledgeTurn,
  SimulatedKnowledgeTurnOutcome,
} from '@voice-agent/contracts';

/**
 * KB-SIM-1 (DEC-060): turno simulado, determinístico e offline, ligado à
 * concessão emitida pelo `CallLifecycleGateway`. Contexto e autorizador vêm SÓ
 * da concessão; concessão copiada ou forjada lança erro (fail-closed). O núcleo
 * (motor + textos fixos) está em `@voice-agent/agent-tools` (DEC-061).
 * NÃO registrado em composição de produção.
 */
export interface SimulatedKnowledgeTurnInput {
  readonly grant: PublishedToolGrant;
  readonly registry: ToolRegistryPort;
  readonly utterance: string;
  readonly turnId?: string | undefined;
}

export async function runSimulatedKnowledgeTurn(
  input: SimulatedKnowledgeTurnInput,
): Promise<SimulatedKnowledgeTurn> {
  const context = buildPublishedVersionToolExecutionContext(
    input.grant,
    input.turnId !== undefined ? { turnId: input.turnId } : {},
  );
  return runKnowledgeTurn({
    registry: input.registry,
    isToolAllowed: createPublishedVersionToolAuthorizer(input.grant),
    context,
    utterance: input.utterance,
  });
}
