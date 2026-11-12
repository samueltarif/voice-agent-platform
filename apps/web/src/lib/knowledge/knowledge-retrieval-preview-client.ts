import type {
  KnowledgeRetrievalPreview,
  KnowledgeRetrievalPreviewHttpBody,
} from '@voice-agent/contracts';
import { knowledgeOrgHeaders } from './knowledge-org-header';
import { normalizeKnowledgeBffError } from './knowledge-documents-client';

/** Pré-visualização offline da busca (DEC-055). Envia a organização exibida na tela. */
export async function previewKnowledgeRetrieval(
  orgSlug: string,
  body: KnowledgeRetrievalPreviewHttpBody,
): Promise<KnowledgeRetrievalPreview> {
  const res = await fetch('/api/knowledge/retrieval-preview', {
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
  return (payload as { preview: KnowledgeRetrievalPreview }).preview;
}
