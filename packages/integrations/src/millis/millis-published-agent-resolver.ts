import type { ConversationSessionPreparationRequest } from '@voice-agent/contracts';
import type { MillisPublishedAgent } from './millis-conversation-session-adapter.js';
import {
  mapPublishedAgentToMillis,
  type FieldMappingEntry,
  type PublishedAgentVersion,
} from './millis-agent-config-mapper.js';

/**
 * 008-MVP3 — Liga o mapeamento ao adaptador de sessão: a versão é buscada no
 * SERVIDOR pela organização + versão da tentativa (nunca vinda do navegador),
 * e qualquer recusa vira `null` (o adaptador responde UNAVAILABLE/REJECTED
 * sem chamar a Millis). O relatório de campos sai só como contagens.
 */
export interface PublishedAgentResolverDependencies {
  readonly findVersion: (
    organizationId: string,
    agentVersionId: string,
  ) => Promise<PublishedAgentVersion | null>;
  readonly maxDurationSeconds: number;
  readonly onMapped?: (summary: Readonly<Record<string, number>>) => void;
}

function summarize(report: readonly FieldMappingEntry[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const entry of report) summary[entry.status] = (summary[entry.status] ?? 0) + 1;
  return summary;
}

export function createPublishedAgentResolver(
  deps: PublishedAgentResolverDependencies,
): (request: ConversationSessionPreparationRequest) => Promise<MillisPublishedAgent | null> {
  return async (request) => {
    const version = await deps.findVersion(request.organizationId, request.agentVersionId);
    if (!version) return null;
    const result = mapPublishedAgentToMillis(version, {
      organizationId: request.organizationId,
      agentVersionId: request.agentVersionId,
      maxDurationSeconds: deps.maxDurationSeconds,
    });
    if (result.kind !== 'MAPPED') return null;
    deps.onMapped?.(summarize(result.report));
    return { agentConfig: result.agentConfig };
  };
}
