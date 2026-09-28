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

export interface AgentDetailDataResult {
  readonly agent: AgentMetadataResponse | null;
  readonly versions: readonly AgentVersionMetadataResponse[];
  readonly draftVersion: AgentVersionMetadataResponse | null;
  readonly draftConfig: AgentConfigurationSnapshotV1 | null;
  readonly isNotFound: boolean;
  readonly errorMessage: string | null;
}

async function fetchDraftConfig(
  tenantClient: TenantApiClient,
  agentId: string,
  draftVersionId: string,
): Promise<AgentConfigurationSnapshotV1 | null> {
  const res = await tenantClient.request<AgentVersionConfigurationResponse>({
    method: 'GET',
    path: `/v1/agents/${agentId}/versions/${draftVersionId}/configuration`,
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
    isNotFound: is404,
    errorMessage: is404 ? null : 'Não foi possível carregar os detalhes do agente.',
  };
}

export async function loadAgentDetailData(
  context: ActiveOrganizationContext,
  userId: string,
  agentId: string,
): Promise<AgentDetailDataResult> {
  const internalClient = getInternalApiClient();
  const tenantClient = new TenantApiClient(internalClient, context, userId);

  try {
    const agent = await tenantClient.request<AgentMetadataResponse>({
      method: 'GET',
      path: `/v1/agents/${agentId}`,
    });

    const versions = await tenantClient.request<AgentVersionMetadataResponse[]>({
      method: 'GET',
      path: `/v1/agents/${agentId}/versions`,
    });

    const draftVersion =
      versions.find((v: AgentVersionMetadataResponse) => v.status === 'DRAFT') ?? null;
    const shouldFetchConfig = draftVersion !== null && canReadAgentConfig(context.role);
    const draftConfig = shouldFetchConfig
      ? await fetchDraftConfig(tenantClient, agentId, draftVersion.id)
      : null;

    return {
      agent,
      versions,
      draftVersion,
      draftConfig,
      isNotFound: false,
      errorMessage: null,
    };
  } catch (err: unknown) {
    return handleDetailError(err);
  }
}
