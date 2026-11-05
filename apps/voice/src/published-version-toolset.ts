import type {
  AgentConfigurationSnapshotV1,
  CanonicalToolName,
  ToolExecutionContext,
} from '@voice-agent/contracts';
import { isIssuedPublishedToolGrant, type PublishedToolGrant } from './published-tool-grant.js';

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
 * D8b complementar (DEC-048) — verificador ligado a uma concessão emitida pelo
 * `CallLifecycleGateway`. Recusa (fail-closed) quando:
 * - a concessão não foi emitida por `published-tool-grant` (falsificada/cópia);
 * - `context.organizationId`, `context.agentVersionId` ou `context.callId`
 *   faltam ou divergem da concessão;
 * - `context.snapshot` falta ou não é o MESMO objeto da concessão (E3);
 * - a ferramenta não está na cópia congelada do toolset da concessão.
 * IDs são comparados por igualdade com os da concessão, que já passaram pela
 * validação UUID de `createCallSession`; nenhum formato extra é imposto.
 */
export function createPublishedVersionToolAuthorizer(
  grant: PublishedToolGrant,
): (toolName: string, context: ToolExecutionContext) => boolean {
  if (!isIssuedPublishedToolGrant(grant)) return () => false;
  return (toolName: string, context: ToolExecutionContext): boolean =>
    context.organizationId === grant.organizationId &&
    context.agentVersionId === grant.agentVersionId &&
    context.callId === grant.callId &&
    context.snapshot === grant.snapshot &&
    grant.tools.includes(toolName as CanonicalToolName);
}

export interface PublishedToolContextIdentifiers {
  readonly turnId?: string | undefined;
  readonly correlationId?: string | undefined;
}

const ALLOWED_IDENTIFIER_KEYS: ReadonlySet<string> = new Set(['turnId', 'correlationId']);

/**
 * Monta o contexto de execução a partir da concessão (única fonte de
 * organização, agente, versão, chamada e snapshot). Só aceita `turnId` e
 * `correlationId`; qualquer outra chave, ou concessão não emitida, lança erro.
 */
export function buildPublishedVersionToolExecutionContext(
  grant: PublishedToolGrant,
  identifiers: PublishedToolContextIdentifiers = {},
): ToolExecutionContext {
  if (!isIssuedPublishedToolGrant(grant)) {
    throw new TypeError('A trusted published tool grant is required');
  }
  if (Object.keys(identifiers).some((key) => !ALLOWED_IDENTIFIER_KEYS.has(key))) {
    throw new TypeError('Only turnId and correlationId may be supplied');
  }
  return {
    organizationId: grant.organizationId,
    agentId: grant.agentId,
    agentVersionId: grant.agentVersionId,
    callId: grant.callId,
    snapshot: grant.snapshot,
    ...(identifiers.turnId !== undefined ? { turnId: identifiers.turnId } : {}),
    ...(identifiers.correlationId !== undefined
      ? { correlationId: identifiers.correlationId }
      : {}),
  };
}
