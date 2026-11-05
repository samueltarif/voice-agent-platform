import type {
  AgentConfigurationSnapshotV1,
  CanonicalToolName,
  ToolExecutionContext,
} from '@voice-agent/contracts';

/**
 * Resolves the configured canonical tool identities from an AgentVersion snapshot.
 * Returns an empty array if the snapshot does not declare any tools.
 */
export function resolvePublishedVersionToolset(
  snapshot?: AgentConfigurationSnapshotV1 | undefined,
): readonly CanonicalToolName[] {
  if (!snapshot || !Array.isArray(snapshot.tools)) {
    return [];
  }
  return snapshot.tools;
}

/**
 * Checks whether a given canonical tool is configured/allowed in an AgentVersion snapshot.
 */
export function isToolConfiguredInSnapshot(
  toolName: string,
  snapshot?: AgentConfigurationSnapshotV1 | undefined,
): boolean {
  const toolset = resolvePublishedVersionToolset(snapshot);
  return toolset.includes(toolName as CanonicalToolName);
}

/**
 * Creates an authorization predicate for `ToolExecutionEngineDependencies.isToolAllowed`.
 *
 * D8b (DEC-047) — fail-closed, sem snapshot de reserva:
 * - o contexto precisa trazer `snapshot`; sem ele, recusa;
 * - o `snapshot` do contexto precisa ser o MESMO objeto da versão publicada
 *   ligado a este verificador pelo código servidor; snapshot de outra versão
 *   (outro objeto, mesmo que com conteúdo igual) recusa;
 * - a ferramenta precisa estar no toolset desse snapshot.
 *
 * Limite conhecido: `AgentConfigurationSnapshotV1` não carrega organização nem
 * versão, então este verificador não confere `context.organizationId` nem
 * `context.agentVersionId` contra o snapshot (proposta registrada na DEC-047).
 * O snapshot só é confiável quando vem de código servidor autorizado, nunca do
 * modelo ou do cliente.
 */
export function createPublishedVersionToolAuthorizer(
  publishedSnapshot: AgentConfigurationSnapshotV1,
): (toolName: string, context: ToolExecutionContext) => boolean {
  return (toolName: string, context: ToolExecutionContext): boolean => {
    if (!publishedSnapshot || context.snapshot !== publishedSnapshot) return false;
    return isToolConfiguredInSnapshot(toolName, publishedSnapshot);
  };
}

/**
 * Builds a provider-neutral ToolExecutionContext bound to a published AgentVersion snapshot.
 */
export function buildPublishedVersionToolExecutionContext(params: {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
  readonly callId?: string | undefined;
  readonly turnId?: string | undefined;
  readonly correlationId?: string | undefined;
}): ToolExecutionContext {
  return {
    organizationId: params.organizationId,
    agentId: params.agentId,
    agentVersionId: params.agentVersionId,
    snapshot: params.snapshot,
    ...(params.callId !== undefined ? { callId: params.callId } : {}),
    ...(params.turnId !== undefined ? { turnId: params.turnId } : {}),
    ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
  };
}
