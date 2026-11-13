import {
  knowledgeSimulatedTurnResponseSchema,
  type KnowledgeSimulatedTurnHttpBody,
  type KnowledgeSimulatedTurnResponse,
} from '@voice-agent/contracts';
import { knowledgeOrgHeaders } from './knowledge-org-header';
import { normalizeKnowledgeBffError } from './knowledge-documents-client';

/** Resposta fora do contrato nunca é exibida como se fosse do motor. */
const INVALID_RESPONSE = {
  message: 'Resposta inesperada do servidor.',
  code: 'INVALID_RESPONSE',
  status: 502,
};

/** Um turno da conversa simulada (DEC-061). Envia a organização exibida na tela. */
export async function sendSimulatedKnowledgeTurn(
  orgSlug: string,
  body: KnowledgeSimulatedTurnHttpBody,
): Promise<KnowledgeSimulatedTurnResponse> {
  const res = await fetch('/api/knowledge/simulated-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...knowledgeOrgHeaders(orgSlug) },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) throw normalizeKnowledgeBffError(res.status, payload);
  const parsed = knowledgeSimulatedTurnResponseSchema.safeParse(
    (payload as { simulation?: unknown } | null)?.simulation,
  );
  if (!parsed.success) throw INVALID_RESPONSE;
  return parsed.data;
}
