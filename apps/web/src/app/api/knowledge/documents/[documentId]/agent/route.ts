import type { NextRequest, NextResponse } from 'next/server';
import { associateKnowledgeDocumentHttpBodySchema } from '@voice-agent/contracts';
import { forwardKnowledgeManagement } from '../../../forward-knowledge-management.js';

/** Associa o documento a um agente da organização ou libera para todos (`agentId: null`). */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
): Promise<NextResponse> {
  const { documentId } = await context.params;
  return forwardKnowledgeManagement({
    req,
    documentId,
    allowedRoles: ['OWNER', 'ADMIN'],
    method: 'PUT',
    apiPath: `/v1/knowledge/documents/${documentId}/agent`,
    bodySchema: associateKnowledgeDocumentHttpBodySchema,
    fallbackMessage: 'Não foi possível alterar o agente do documento.',
  });
}
