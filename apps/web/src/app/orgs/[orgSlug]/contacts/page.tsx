import * as React from 'react';
import { TenantShell } from '../../../../shell/tenant-shell';
import { ContactsWorkspace } from '../../../../features/contacts/contacts-workspace';
import { OperationsLoadError } from '../../../../features/operations/operations-load-error';
import { loadOrNull, resolveTenantPage } from '../../../../lib/operations/resolve-tenant-page';
import type {
  ContactListSummary,
  ContactSuppressionView,
} from '../../../../lib/operations/operations-types';

interface ContactsPageProps {
  readonly params: Promise<{ orgSlug: string }>;
}

export default async function ContactsPage({ params }: ContactsPageProps) {
  const { orgSlug } = await params;
  const page = await resolveTenantPage(orgSlug, 'contacts');
  if (!page) return null;
  const [lists, suppressions] = await Promise.all([
    loadOrNull(() =>
      page.tenant.request<ContactListSummary[]>({ method: 'GET', path: '/v1/contact-lists' }),
    ),
    loadOrNull(() =>
      page.tenant.request<ContactSuppressionView[]>({
        method: 'GET',
        path: '/v1/contact-suppressions?limit=100',
      }),
    ),
  ]);
  return (
    <TenantShell title="Contatos" currentOrg={page.context} organizations={page.organizations}>
      {lists && suppressions ? (
        <ContactsWorkspace
          orgSlug={page.context.slug}
          role={page.context.role}
          lists={lists}
          suppressions={suppressions}
        />
      ) : (
        <OperationsLoadError message="Não foi possível carregar os contatos." />
      )}
    </TenantShell>
  );
}
