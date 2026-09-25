import * as React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button, Card, CardContent } from '@voice-agent/ui';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import { TenantShell } from '../../../../../shell/tenant-shell';
import { AgentCreateForm } from '../../../../../features/agents/agent-create-form';
import { canCreateAgent } from '../../../../../features/agents/agent-permissions';

interface AgentNewPageProps {
  readonly params: Promise<{ orgSlug: string }>;
}

export default async function AgentNewPage({ params }: AgentNewPageProps) {
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

  // Route-slug authority guard: URL slug is navigation, cookie/session is authority
  if (orgSlug !== orgResult.context.slug) {
    redirect(`/orgs/${orgResult.context.slug}/agents/new`);
    return null;
  }

  const activeOrg = orgResult.context;
  const canCreate = canCreateAgent(activeOrg.role);

  return (
    <TenantShell
      title="Novo Agente"
      currentOrg={activeOrg}
      organizations={orgResult.availableOrganizations}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <Link href={`/orgs/${activeOrg.slug}/agents`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span>Voltar para Agentes</span>
            </Link>
          </Button>
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Criar novo agente
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Defina o nome e o identificador único para o agente nesta organização.
          </p>
        </div>

        {!canCreate ? (
          <Card className="border-border/60 max-w-2xl">
            <CardContent className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Acesso Restrito</h3>
              <p className="text-xs text-muted-foreground max-w-sm mb-4">
                Você não possui permissão para criar agentes nesta organização. Solicite acesso a um
                administrador.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/orgs/${activeOrg.slug}/agents`}>Voltar para lista</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <AgentCreateForm orgSlug={activeOrg.slug} />
        )}
      </div>
    </TenantShell>
  );
}
