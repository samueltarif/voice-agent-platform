import * as React from 'react';
import { TenantShell } from '../../../../../../shell/tenant-shell';
import { canReadAgentConfig } from '../../../../../../features/agents/agent-permissions.js';
import { SimulatorView } from '../../../../../../features/agents/simulator/simulator-view.js';
import { selectSimulatorConfiguration } from '../../../../../../features/agents/simulator/select-simulator-configuration.js';
import {
  SIMULATOR_FORBIDDEN_NOTICE,
  SIMULATOR_NOT_FOUND_NOTICE,
} from '../../../../../../features/agents/simulator/simulator-notices.js';
import { loadAgentSimulatorData } from '../load-agent-detail-data.js';
import { resolveVerifiedAgentOrgContext } from '../resolve-verified-agent-org-context.js';

interface AgentSimulatorPageProps {
  readonly params: Promise<{ orgSlug: string; agentId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Conversa simulada (DEC-061): só para agente ativo com versão publicada. */
function resolveConversation(data: Awaited<ReturnType<typeof loadAgentSimulatorData>>) {
  const published = data.versions.find((v) => v.status === 'PUBLISHED');
  return data.agent?.status === 'ACTIVE' && published
    ? { publishedVersionNumber: published.versionNumber }
    : null;
}

/**
 * Simulador offline (DEC-050): somente leitura, montado no servidor a partir
 * do carregamento autenticado do detalhe do agente. A única parte interativa
 * é a conversa simulada (DEC-061), que chama o BFF autenticado; sem IA, voz,
 * telefonia ou gravação de dados.
 */
export default async function AgentSimulatorPage({
  params,
  searchParams,
}: AgentSimulatorPageProps) {
  const { orgSlug, agentId } = await params;
  const verified = await resolveVerifiedAgentOrgContext(orgSlug, agentId, '/simulador');
  if (!verified) return null;
  const { activeOrg, user, orgResult } = verified;
  const base = { organizationName: activeOrg.name, orgSlug: activeOrg.slug, agentId };

  let view: React.ReactElement;
  if (!canReadAgentConfig(activeOrg.role)) {
    view = (
      <SimulatorView
        {...base}
        agentName={null}
        selection={null}
        notice={SIMULATOR_FORBIDDEN_NOTICE}
      />
    );
  } else {
    const data = await loadAgentSimulatorData(activeOrg, user.id, agentId);
    const requested = (await searchParams).config;
    const selection = data.agent
      ? selectSimulatorConfiguration({
          draftConfig: data.draftConfig,
          publishedConfig: data.publishedConfig,
          requested,
        })
      : null;
    const notice = data.agent ? null : SIMULATOR_NOT_FOUND_NOTICE;
    const conversation = resolveConversation(data);
    view = (
      <SimulatorView
        {...base}
        agentName={data.agent?.name ?? null}
        selection={selection}
        notice={notice}
        conversation={conversation}
      />
    );
  }

  return (
    <TenantShell
      title="Simulador do agente"
      currentOrg={activeOrg}
      organizations={orgResult.availableOrganizations}
    >
      {view}
    </TenantShell>
  );
}
