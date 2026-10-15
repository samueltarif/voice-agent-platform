import { NextResponse, type NextRequest } from 'next/server';
import type { IngestKnowledgeDocumentHttpBody } from '@voice-agent/contracts';
import { getServerOrganizationContext } from '../../../../lib/organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../../../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../lib/api/tenant-api-client.js';
import { mapKnowledgeBffError } from '../knowledge-error-response.js';
import { parseIngestBody, parseListQuery, toListPath } from '../knowledge-request-parsers.js';
import { isSameOriginRequest } from '../../agents/is-same-origin-request.js';
import { checkKnowledgeOrgConsistency } from '../knowledge-org-consistency.js';

type OrgContext = Awaited<ReturnType<typeof getServerOrganizationContext>>;

function checkAccess(result: OrgContext): NextResponse | null {
  if (result.status === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Sessão não autenticada.' }, { status: 401 });
  }
  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });
  }
  return null;
}

function denyForbidden(): NextResponse {
  return NextResponse.json(
    { error: 'Permissão insuficiente.', code: 'FORBIDDEN' },
    { status: 403 },
  );
}

function hasReadPermission(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

function hasIngestPermission(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

function authorizeRead(req: NextRequest, context: ActiveOrganizationContext): NextResponse | null {
  if (!hasReadPermission(context.role)) return denyForbidden();
  return checkKnowledgeOrgConsistency(req, context.slug);
}

function authorizeIngest(
  req: NextRequest,
  context: ActiveOrganizationContext,
): NextResponse | null {
  if (!hasIngestPermission(context.role)) return denyForbidden();
  return checkKnowledgeOrgConsistency(req, context.slug);
}

interface ExecuteListOptions {
  readonly context: ActiveOrganizationContext;
  readonly userId: string;
  readonly path: string;
  readonly requestId?: string | undefined;
}

async function executeListRequest(options: ExecuteListOptions): Promise<NextResponse> {
  const { context, userId, path, requestId } = options;
  try {
    const tenant = new TenantApiClient(getInternalApiClient(), context, userId);
    const documents = await tenant.request({
      method: 'GET',
      path,
      ...(requestId ? { requestId } : {}),
    });
    return NextResponse.json({ documents });
  } catch (error) {
    return mapKnowledgeBffError(error, 'Falha ao listar documentos.');
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
  }
  const requestId = req.headers.get('x-request-id') ?? undefined;
  const result = await getServerOrganizationContext(requestId ? { requestId } : {});
  const blocked = checkAccess(result);
  if (blocked) return blocked;
  const denied = authorizeRead(req, result.context!);
  if (denied) return denied;
  const parsed = parseListQuery(req);
  if (!parsed.ok) return parsed.response;
  return executeListRequest({
    context: result.context!,
    userId: result.user!.id,
    path: toListPath(parsed.query),
    ...(requestId ? { requestId } : {}),
  });
}

interface ExecuteIngestOptions {
  readonly context: ActiveOrganizationContext;
  readonly userId: string;
  readonly body: IngestKnowledgeDocumentHttpBody;
  readonly requestId?: string | undefined;
}

async function executeIngestRequest(options: ExecuteIngestOptions): Promise<NextResponse> {
  const { context, userId, body, requestId } = options;
  try {
    const tenant = new TenantApiClient(getInternalApiClient(), context, userId);
    const created = await tenant.request({
      method: 'POST',
      path: '/v1/knowledge/documents',
      body,
      ...(requestId ? { requestId } : {}),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapKnowledgeBffError(error, 'Falha ao ingerir documento.');
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
  }
  const requestId = req.headers.get('x-request-id') ?? undefined;
  const result = await getServerOrganizationContext(requestId ? { requestId } : {});
  const blocked = checkAccess(result);
  if (blocked) return blocked;
  const denied = authorizeIngest(req, result.context!);
  if (denied) return denied;
  const parsed = await parseIngestBody(req);
  if (!parsed.ok) return parsed.response;
  return executeIngestRequest({
    context: result.context!,
    userId: result.user!.id,
    body: parsed.data,
    ...(requestId ? { requestId } : {}),
  });
}
