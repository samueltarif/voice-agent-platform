import * as React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Plus } from 'lucide-react';
import { Button, Card, CardContent } from '@voice-agent/ui';
import type { AgentMetadataResponse } from '@voice-agent/contracts';
import { getServerOrganizationContext } from '../../../../lib/organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../../../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../lib/api/tenant-api-client.js';
import { TenantShell } from '../../../../shell/tenant-shell';
import { AgentList } from '../../../../features/agents/agent-list';
import { canCreateAgent } from '../../../../features/agents/agent-permissions';

interface AgentsPageProps {
  readonly params: Promise<{ orgSlug: string }>;
}

async function fetchTenantAgents(
  context: ActiveOrganizationContext,
  userId: string,
): Promise<{ agents: AgentMetadataResponse[]; loadError: string | null }> {
  try {
    const internalClient = getInternalApiClient();
    const tenantClient = new TenantApiClient(internalClient, context, userId);
    const agents = await tenantClient.request<AgentMetadataResponse[]>({
      method: 'GET',
      path: '/v1/agents',
    });
    return { agents, loadError: null };
  } catch {
    return { agents: [], loadError: 'Não foi possível carregar os agentes.' };
  }
}

export default async function AgentsPage({ params }: AgentsPageProps) {
  const { orgSlug } = await params;
  const orgResult = await getServerOrganizationContext();

  if (orgResult.status === 'UNAUTHENTICATED') {
    redirect('/login');
    return null;
  }

  if (orgResult.status !== 'RESOLVED' || !orgResult.context || !orgResult.user) {
    redirect('/dashboard');
    return null;
  }

  if (orgSlug !== orgResult.context.slug) {
    redirect(`/orgs/${orgResult.context.slug}/agents`);
    return null;
  }

  const activeOrg = orgResult.context;
  const canCreate = canCreateAgent(activeOrg.role);
  const { agents, loadError } = await fetchTenantAgents(activeOrg, orgResult.user.id);

  return (
    <TenantShell
      title="Agentes de IA"
      currentOrg={activeOrg}
      organizations={orgResult.availableOrganizations}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Agentes
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Gerencie e configure os agentes inteligentes de voz da organização.
            </p>
          </div>

          {canCreate && (
            <Button asChild size="sm" className="gap-2 h-9 text-xs min-h-[44px] shadow-xs">
              <Link href={`/orgs/${activeOrg.slug}/agents/new`}>
                <Plus className="h-4 w-4" />
                <span>Criar agente</span>
              </Link>
            </Button>
          )}
        </div>

        {loadError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-center gap-3 py-6 px-4 text-destructive text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{loadError}</span>
            </CardContent>
          </Card>
        ) : (
          <AgentList agents={agents} canCreate={canCreate} orgSlug={activeOrg.slug} />
        )}
      </div>
    </TenantShell>
  );
}
