import type { NextRequest, NextResponse } from 'next/server';
import { knowledgeLifecycleHttpBodySchema } from '@voice-agent/contracts';
import { forwardKnowledgeManagement } from '../../../forward-knowledge-management.js';

/** Restaura um documento arquivado (DEC-054). */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
): Promise<NextResponse> {
  const { documentId } = await context.params;
  return forwardKnowledgeManagement({
    req,
    documentId,
    allowedRoles: ['OWNER', 'ADMIN'],
    method: 'POST',
    apiPath: `/v1/knowledge/documents/${documentId}/restore`,
    bodySchema: knowledgeLifecycleHttpBodySchema,
    fallbackMessage: 'Não foi possível restaurar o documento.',
  });
}
