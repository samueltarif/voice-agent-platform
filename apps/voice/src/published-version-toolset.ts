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
 * Creates an authorization predicate suitable for `ToolExecutionEngineDependencies.isToolAllowed`.
 * Validates that the requested tool is explicitly in the published snapshot's configured toolset.
 *
 * Server-side trusted authority: The toolset is read from `context.snapshot` or the fallback
 * published snapshot, never from model arguments or untrusted caller data.
 */
export function createPublishedVersionToolAuthorizer(
  publishedSnapshot?: AgentConfigurationSnapshotV1 | undefined,
): (toolName: string, context: ToolExecutionContext) => boolean {
  return (toolName: string, context: ToolExecutionContext): boolean => {
    const effectiveSnapshot = context.snapshot ?? publishedSnapshot;
    return isToolConfiguredInSnapshot(toolName, effectiveSnapshot);
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
