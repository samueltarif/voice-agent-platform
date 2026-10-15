import { NextResponse, type NextRequest } from 'next/server';
import {
  ingestKnowledgeDocumentHttpBodySchema,
  listKnowledgeDocumentsQuerySchema,
  type IngestKnowledgeDocumentHttpBody,
  type ListKnowledgeDocumentsQuery,
} from '@voice-agent/contracts';

export type ParsedListQuery =
  | { readonly ok: true; readonly query: ListKnowledgeDocumentsQuery }
  | { readonly ok: false; readonly response: NextResponse };

export function parseListQuery(req: NextRequest): ParsedListQuery {
  const url = new URL(req.url);
  const parsed = listKnowledgeDocumentsQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    collection: url.searchParams.get('collection') ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Parâmetros inválidos.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      ),
    };
  }
  return { ok: true, query: parsed.data };
}

export function toListPath(query: ListKnowledgeDocumentsQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  if (query.status) params.set('status', query.status);
  if (query.collection) params.set('collection', query.collection);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return `/v1/knowledge/documents${suffix}`;
}

export type ParsedIngestBody =
  | { readonly ok: true; readonly data: IngestKnowledgeDocumentHttpBody }
  | { readonly ok: false; readonly response: NextResponse };

export async function parseIngestBody(req: NextRequest): Promise<ParsedIngestBody> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Corpo JSON inválido.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      ),
    };
  }
  const parsed = ingestKnowledgeDocumentHttpBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ');
    return {
      ok: false,
      response: NextResponse.json(
        { error: message || 'Dados inválidos.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
