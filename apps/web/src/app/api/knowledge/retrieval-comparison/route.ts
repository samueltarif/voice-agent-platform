import type { NextRequest, NextResponse } from 'next/server';
import { knowledgeRetrievalComparisonHttpBodySchema } from '@voice-agent/contracts';
import { forwardKnowledgeManagement } from '../forward-knowledge-management.js';

/**
 * Comparação ADMINISTRATIVA v1 × v2 da busca (DEC-067, PR B1). Só OWNER/ADMIN.
 * Sem IA, sem chamada; nenhum agente passa a usar a v2.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return forwardKnowledgeManagement({
    req,
    allowedRoles: ['OWNER', 'ADMIN'],
    method: 'POST',
    apiPath: '/v1/knowledge/retrieval-comparison',
    bodySchema: knowledgeRetrievalComparisonHttpBodySchema,
    fallbackMessage: 'Não foi possível comparar as buscas agora.',
    wrapResult: (result) => ({ comparison: result }),
  });
}
