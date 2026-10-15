import type {
  KnowledgeDocumentResponse,
  KnowledgeSourceType,
  ListKnowledgeDocumentsQuery,
} from '@voice-agent/contracts';
import { knowledgeDocumentResponseSchema } from '@voice-agent/contracts';
import { knowledgeOrgHeaders } from './knowledge-org-header';

export type KnowledgeBffListQuery = ListKnowledgeDocumentsQuery;

export interface KnowledgeBffIngestInput {
  readonly title: string;
  readonly locator: string;
  readonly sourceType: KnowledgeSourceType;
  readonly rawText: string;
  readonly collection?: string | undefined;
}

export const knowledgeBffDocumentSchema = knowledgeDocumentResponseSchema;
export type KnowledgeBffDocument = KnowledgeDocumentResponse;

export interface KnowledgeBffError {
  readonly message: string;
  readonly code: string;
  readonly status: number;
}

export function normalizeKnowledgeBffError(status: number, payload: unknown): KnowledgeBffError {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as { error?: string; code?: string }).error;
    const code = (payload as { code?: string }).code;
    if (typeof err === 'string' && err.length > 0) {
      return {
        message: err,
        code: typeof code === 'string' ? code : 'API_ERROR',
        status,
      };
    }
  }
  return { message: 'Falha na operação de conhecimento.', code: 'API_ERROR', status };
}

const BFF_BASE = '/api/knowledge/documents';

async function parseBffResponse(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toListSearchParams(query: KnowledgeBffListQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  if (query.status) params.set('status', query.status);
  if (query.collection) params.set('collection', query.collection);
  return params.size > 0 ? `?${params.toString()}` : '';
}

export async function fetchKnowledgeDocuments(
  orgSlug: string,
  query: KnowledgeBffListQuery = {},
  init?: RequestInit,
): Promise<{ documents: KnowledgeBffDocument[] }> {
  const res = await fetch(`${BFF_BASE}${toListSearchParams(query)}`, {
    ...init,
    method: 'GET',
    headers: { ...(init?.headers ?? {}), ...knowledgeOrgHeaders(orgSlug) },
  });
  const payload = await parseBffResponse(res);
  if (!res.ok) throw normalizeKnowledgeBffError(res.status, payload);
  const documents = (payload as { documents?: unknown } | null)?.documents;
  if (!Array.isArray(documents)) {
    throw normalizeKnowledgeBffError(502, {
      error: 'Resposta inválida do servidor.',
      code: 'INVALID_RESPONSE',
    });
  }
  return { documents: documents as KnowledgeBffDocument[] };
}

export async function ingestKnowledgeDocument(
  orgSlug: string,
  input: KnowledgeBffIngestInput,
  init?: RequestInit,
): Promise<unknown> {
  const body = {
    title: input.title,
    source: { sourceType: input.sourceType, locator: input.locator },
    rawText: input.rawText,
    ...(input.collection ? { collection: input.collection } : {}),
  };
  const res = await fetch(BFF_BASE, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...knowledgeOrgHeaders(orgSlug),
    },
    body: JSON.stringify(body),
  });
  const payload = await parseBffResponse(res);
  if (!res.ok) throw normalizeKnowledgeBffError(res.status, payload);
  return payload;
}

export async function archiveKnowledgeDocument(
  orgSlug: string,
  documentId: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${BFF_BASE}/${documentId}/archive`, {
    ...init,
    method: 'POST',
    headers: { ...(init?.headers ?? {}), ...knowledgeOrgHeaders(orgSlug) },
  });
  const payload = await parseBffResponse(res);
  if (!res.ok) throw normalizeKnowledgeBffError(res.status, payload);
  return payload;
}
