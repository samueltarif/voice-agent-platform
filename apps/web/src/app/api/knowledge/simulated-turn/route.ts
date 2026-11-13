import type { NextRequest, NextResponse } from 'next/server';
import { knowledgeSimulatedTurnHttpBodySchema } from '@voice-agent/contracts';
import { forwardKnowledgeManagement } from '../forward-knowledge-management.js';

/**
 * Conversa simulada do Agent Studio (DEC-061): um turno determinístico com a
 * versão publicada do agente. O navegador envia só o agente e a pergunta; a
 * organização vem da sessão e a API revalida agente, versão e permissões.
 * Sem IA, chamada ou provedor.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return forwardKnowledgeManagement({
    req,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER'],
    method: 'POST',
    apiPath: '/v1/knowledge/simulated-turn',
    bodySchema: knowledgeSimulatedTurnHttpBodySchema,
    fallbackMessage: 'Não foi possível simular a resposta agora.',
    wrapResult: (result) => ({ simulation: result }),
  });
}
