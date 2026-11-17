import type { NextRequest, NextResponse } from 'next/server';
import { KNOWLEDGE_UPLOAD_LIMITS, knowledgeExtractionHttpBodySchema } from '@voice-agent/contracts';
import { forwardKnowledgeManagement } from '../forward-knowledge-management.js';

/** Prazo da API: extração (até 15 s no worker) + início do worker + rede interna. */
const EXTRACTION_TIMEOUT_MS = 30_000;

/**
 * Envio de arquivo (DEC-065): devolve só a PRÉ-VISUALIZAÇÃO do texto; nada é
 * gravado. Mesma origem, sessão, papel e organização são verificados antes de
 * ler o corpo, que tem teto próprio (base64 de até 10 MiB + margem).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return forwardKnowledgeManagement({
    req,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER'],
    method: 'POST',
    apiPath: '/v1/knowledge/extractions',
    bodySchema: knowledgeExtractionHttpBodySchema,
    fallbackMessage: 'Não foi possível ler o arquivo agora.',
    wrapResult: (result) => ({ extraction: result }),
    maxBodyBytes: KNOWLEDGE_UPLOAD_LIMITS.maxRequestBodyBytes,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });
}
