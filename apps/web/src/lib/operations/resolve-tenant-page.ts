import { redirect } from 'next/navigation';
import type { OrganizationContextResponse } from '@voice-agent/contracts';
import { getServerOrganizationContext } from '../organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../organization/active-organization-context.js';
import { getInternalApiClient } from '../api/api-client-factory.js';
import { TenantApiClient } from '../api/tenant-api-client.js';

export interface TenantPage {
  readonly context: ActiveOrganizationContext;
  readonly organizations: readonly OrganizationContextResponse[];
  readonly tenant: TenantApiClient;
}

/**
 * Guardas comuns das telas de operação: sessão → organização ativa → slug da
 * URL igual ao da organização ativa (senão redireciona para a canônica).
 * `segment` é o caminho após `/orgs/{slug}/`. Retorna null após redirecionar.
 */
export async function resolveTenantPage(
  orgSlug: string,
  segment: string,
): Promise<TenantPage | null> {
  const result = await getServerOrganizationContext();
  if (result.status === 'UNAUTHENTICATED') {
    redirect('/login');
    return null;
  }
  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    redirect('/dashboard');
    return null;
  }
  if (orgSlug !== result.context.slug) {
    redirect(`/orgs/${result.context.slug}/${segment}`);
    return null;
  }
  return {
    context: result.context,
    organizations: result.availableOrganizations,
    tenant: new TenantApiClient(getInternalApiClient(), result.context, result.user.id),
  };
}

/** Leitura inicial no servidor; falha vira estado de erro explícito (nunca dados falsos). */
export async function loadOrNull<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

/** 404 real da API (recurso inexistente ou de outro tenant). */
export function isNotFoundError(error: unknown): boolean {
  return (error as { status?: unknown })?.status === 404;
}
