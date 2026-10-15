/**
 * Header que a UI envia para declarar a organização exibida na tela.
 * O BFF compara com a organização ativa resolvida no servidor (cookie compartilhado
 * entre abas) e recusa a mutação quando divergem. Não concede nenhuma autorização.
 */
export const KNOWLEDGE_ORG_HEADER = 'x-knowledge-org-slug';

export function knowledgeOrgHeaders(orgSlug: string): Record<string, string> {
  return { [KNOWLEDGE_ORG_HEADER]: orgSlug };
}
