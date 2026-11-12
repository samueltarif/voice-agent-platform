import type { NextRequest, NextResponse } from 'next/server';
import { knowledgeRetrievalPreviewHttpBodySchema } from '@voice-agent/contracts';
import { forwardKnowledgeManagement } from '../forward-knowledge-management.js';

/**
 * Pré-visualização offline da busca na Base de Conhecimento (DEC-055).
 * Sem IA, sem chamada, sem fornecedor: só mostra os trechos que o agente receberia.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return forwardKnowledgeManagement({
    req,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER'],
    method: 'POST',
    apiPath: '/v1/knowledge/retrieval-preview',
    bodySchema: knowledgeRetrievalPreviewHttpBodySchema,
    fallbackMessage: 'Não foi possível testar a busca agora.',
    wrapResult: (result) => ({ preview: result }),
  });
}
