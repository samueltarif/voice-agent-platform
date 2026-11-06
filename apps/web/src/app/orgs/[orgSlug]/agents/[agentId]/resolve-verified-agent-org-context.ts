import { redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';

/**
 * Verificação de sessão, organização ativa e `orgSlug` da URL usada pelo
 * detalhe do agente e pelo simulador (extraída sem mudança de comportamento).
 */
export async function resolveVerifiedAgentOrgContext(
  orgSlug: string,
  agentId: string,
  canonicalSuffix = '',
) {
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
    redirect(`/orgs/${orgResult.context.slug}/agents/${agentId}${canonicalSuffix}`);
    return null;
  }
  return { activeOrg: orgResult.context, user: orgResult.user, orgResult };
}
