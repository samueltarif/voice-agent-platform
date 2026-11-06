import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  AgentVersionConfigurationResponse,
  AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { getInternalApiClient } from '../../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';
import type { ActiveOrganizationContext } from '../../../../../lib/organization/active-organization-context.js';
import { canReadAgentConfig } from '../../../../../features/agents/agent-permissions.js';
import { internalApiPath, uuidRouteSegment } from '../../../../../lib/api/internal-api-path.js';

export interface AgentDetailDataResult {
  readonly agent: AgentMetadataResponse | null;
  readonly versions: readonly AgentVersionMetadataResponse[];
  readonly draftVersion: AgentVersionMetadataResponse | null;
  readonly draftConfig: AgentConfigurationSnapshotV1 | null;
  readonly publishedConfig: AgentConfigurationSnapshotV1 | null;
  readonly isNotFound: boolean;
  readonly errorMessage: string | null;
}

async function fetchVersionConfig(
  tenantClient: TenantApiClient,
  agentId: string,
  versionId: string,
): Promise<AgentConfigurationSnapshotV1 | null> {
  const res = await tenantClient.request<AgentVersionConfigurationResponse>({
    method: 'GET',
    path: internalApiPath`/v1/agents/${uuidRouteSegment(agentId)}/versions/${uuidRouteSegment(versionId)}/configuration`,
  });
  return res.configuration;
}

function handleDetailError(err: unknown): AgentDetailDataResult {
  const is404 = (err as { status?: number })?.status === 404;
  return {
    agent: null,
    versions: [],
    draftVersion: null,
    draftConfig: null,
    publishedConfig: null,
    isNotFound: is404,
    errorMessage: is404 ? null : 'Não foi possível carregar os detalhes do agente.',
  };
}

interface AgentDetailRequest {
  readonly context: ActiveOrganizationContext;
  readonly userId: string;
  readonly agentId: string;
  /**
   * Simulador (DEC-050): também carrega a configuração publicada quando há
   * rascunho, pela mesma rota autenticada (`agent.config.read` no servidor).
   */
  readonly includePublishedConfig: boolean;
}

async function fetchConfigIf(
  tenantClient: TenantApiClient,
  agentId: string,
  version: AgentVersionMetadataResponse | null,
): Promise<AgentConfigurationSnapshotV1 | null> {
  return version ? fetchVersionConfig(tenantClient, agentId, version.id) : null;
}

async function fetchReadableConfigs(
  tenantClient: TenantApiClient,
  request: AgentDetailRequest,
  versions: readonly AgentVersionMetadataResponse[],
) {
  const draftVersion = versions.find((v) => v.status === 'DRAFT') ?? null;
  const publishedVersion = versions.find((v) => v.status === 'PUBLISHED') ?? null;
  if (!canReadAgentConfig(request.context.role)) {
    return { draftVersion, draftConfig: null, publishedConfig: null };
  }
  const draftConfig = await fetchConfigIf(tenantClient, request.agentId, draftVersion);
  const wantsPublished = !draftVersion || request.includePublishedConfig;
  const publishedConfig = await fetchConfigIf(
    tenantClient,
    request.agentId,
    wantsPublished ? publishedVersion : null,
  );
  return { draftVersion, draftConfig, publishedConfig };
}

async function loadAgentDetail(request: AgentDetailRequest): Promise<AgentDetailDataResult> {
  const internalClient = getInternalApiClient();
  const tenantClient = new TenantApiClient(internalClient, request.context, request.userId);
  try {
    const agent = await tenantClient.request<AgentMetadataResponse>({
      method: 'GET',
      path: internalApiPath`/v1/agents/${uuidRouteSegment(request.agentId)}`,
    });
    const versions = await tenantClient.request<AgentVersionMetadataResponse[]>({
      method: 'GET',
      path: internalApiPath`/v1/agents/${uuidRouteSegment(request.agentId)}/versions`,
    });
    const configs = await fetchReadableConfigs(tenantClient, request, versions);
    return { agent, versions, ...configs, isNotFound: false, errorMessage: null };
  } catch (err: unknown) {
    return handleDetailError(err);
  }
}

/** Detalhe do agente: rascunho quando existe; senão, a versão publicada. */
export async function loadAgentDetailData(
  context: ActiveOrganizationContext,
  userId: string,
  agentId: string,
): Promise<AgentDetailDataResult> {
  return loadAgentDetail({ context, userId, agentId, includePublishedConfig: false });
}

/** Simulador: rascunho salvo e versão publicada, ambos sob `canReadAgentConfig`. */
export async function loadAgentSimulatorData(
  context: ActiveOrganizationContext,
  userId: string,
  agentId: string,
): Promise<AgentDetailDataResult> {
  return loadAgentDetail({ context, userId, agentId, includePublishedConfig: true });
}
