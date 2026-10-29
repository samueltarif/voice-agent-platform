/**
 * Header com o slug da organização EXIBIDA na tela (campanhas, contatos e
 * supressões). O BFF compara com a organização ativa no servidor e recusa a
 * operação quando divergem (troca de organização em outra aba). Não concede
 * nenhuma autorização: o RBAC é sempre revalidado na API.
 */
export const OPERATIONS_ORG_HEADER = 'x-operations-org-slug';

export function operationsOrgHeaders(orgSlug: string): Record<string, string> {
  return { [OPERATIONS_ORG_HEADER]: orgSlug };
}
