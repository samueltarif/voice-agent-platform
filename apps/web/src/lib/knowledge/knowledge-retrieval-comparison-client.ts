import type {
  KnowledgeRetrievalComparison,
  KnowledgeRetrievalPreviewHttpBody,
} from '@voice-agent/contracts';
import { knowledgeOrgHeaders } from './knowledge-org-header';
import { normalizeKnowledgeBffError } from './knowledge-documents-client';

/** Comparação administrativa v1 × v2 da busca (DEC-067). Só OWNER/ADMIN. */
export async function compareKnowledgeRetrieval(
  orgSlug: string,
  body: KnowledgeRetrievalPreviewHttpBody,
): Promise<KnowledgeRetrievalComparison> {
  const res = await fetch('/api/knowledge/retrieval-comparison', {
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
  return (payload as { comparison: KnowledgeRetrievalComparison }).comparison;
}
