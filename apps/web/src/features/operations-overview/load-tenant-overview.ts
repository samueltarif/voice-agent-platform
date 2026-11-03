import { getServerOrganizationContext } from '../../lib/organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../lib/api/tenant-api-client.js';
import type { OrganizationContextResponse } from '@voice-agent/contracts';

export type OverviewPageContext =
  | { readonly kind: 'UNAUTHENTICATED' }
  | { readonly kind: 'NO_ORGANIZATION' }
  | {
      readonly kind: 'READY';
      readonly context: ActiveOrganizationContext;
      readonly organizations: readonly OrganizationContextResponse[];
      readonly tenant: TenantApiClient;
    };

/**
 * Contexto das telas globais (`/dashboard`, `/calls`). Sem organização ativa a
 * tela mostra um estado vazio explícito — nunca redireciona (as telas de
 * organização redirecionam para `/dashboard`, o que criaria um ciclo).
 */
export async function resolveOverviewContext(): Promise<OverviewPageContext> {
  const result = await getServerOrganizationContext();
  if (result.status === 'UNAUTHENTICATED') return { kind: 'UNAUTHENTICATED' };
  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    return { kind: 'NO_ORGANIZATION' };
  }
  return {
    kind: 'READY',
    context: result.context,
    organizations: result.availableOrganizations,
    tenant: new TenantApiClient(getInternalApiClient(), result.context, result.user.id),
  };
}
