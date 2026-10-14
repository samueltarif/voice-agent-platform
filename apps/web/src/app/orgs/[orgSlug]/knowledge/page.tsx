import * as React from 'react';
import { redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../lib/organization/server-organization-context.js';
import { TenantShell } from '../../../../shell/tenant-shell';
import { KnowledgeStudio } from '../../../../features/knowledge/knowledge-studio';

interface KnowledgePageProps {
  readonly params: Promise<{ orgSlug: string }>;
}

export default async function KnowledgePage({ params }: KnowledgePageProps) {
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
    redirect(`/orgs/${orgResult.context.slug}/knowledge`);
    return null;
  }

  const activeOrg = orgResult.context;

  return (
    <TenantShell
      title="Base de Conhecimento"
      currentOrg={activeOrg}
      organizations={orgResult.availableOrganizations}
    >
      <KnowledgeStudio role={activeOrg.role} />
    </TenantShell>
  );
}
