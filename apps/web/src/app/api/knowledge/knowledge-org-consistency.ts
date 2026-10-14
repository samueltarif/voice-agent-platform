import { NextResponse } from 'next/server';
import { isValidOrganizationSlug } from '../../../lib/organization/active-organization-context.js';
import { KNOWLEDGE_ORG_HEADER } from '../../../lib/knowledge/knowledge-org-header.js';

/**
 * Garante que a organização exibida na tela é a mesma organização ativa no servidor.
 * Evita que uma troca de organização em outra aba redirecione silenciosamente uma
 * leitura ou mutação feita a partir de uma tela antiga. Retorna null quando consistente.
 */
export function checkKnowledgeOrgConsistency(
  req: Request,
  activeOrgSlug: string,
): NextResponse | null {
  const declared = req.headers.get(KNOWLEDGE_ORG_HEADER);
  if (!declared || !isValidOrganizationSlug(declared)) {
    return NextResponse.json(
      { error: 'Organização da tela não informada.', code: 'ORG_CONTEXT_REQUIRED' },
      { status: 400 },
    );
  }
  if (declared !== activeOrgSlug) {
    return NextResponse.json(
      {
        error: 'A organização ativa mudou. Recarregue a página para continuar.',
        code: 'ORG_CONTEXT_MISMATCH',
      },
      { status: 409 },
    );
  }
  return null;
}
