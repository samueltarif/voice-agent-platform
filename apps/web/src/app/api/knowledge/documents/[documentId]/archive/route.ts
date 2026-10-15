import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../../../../../lib/organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../../../../../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../../../lib/api/tenant-api-client.js';
import { mapKnowledgeBffError } from '../../../knowledge-error-response.js';
import { isSameOriginRequest } from '../../../../agents/is-same-origin-request.js';
import { checkKnowledgeOrgConsistency } from '../../../knowledge-org-consistency.js';

type OrgContext = Awaited<ReturnType<typeof getServerOrganizationContext>>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function canArchive(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

function checkArchiveAccess(result: OrgContext): NextResponse | null {
  if (result.status === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Sessão não autenticada.' }, { status: 401 });
  }
  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });
  }
  if (!canArchive(result.context.role)) {
    return NextResponse.json(
      { error: 'Permissão insuficiente.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }
  return null;
}

interface ExecuteArchiveOptions {
  readonly context: ActiveOrganizationContext;
  readonly userId: string;
  readonly documentId: string;
  readonly requestId?: string | undefined;
}

async function executeArchiveRequest(options: ExecuteArchiveOptions): Promise<NextResponse> {
  const { context, userId, documentId, requestId } = options;
  try {
    const tenant = new TenantApiClient(getInternalApiClient(), context, userId);
    const archived = await tenant.request({
      method: 'POST',
      path: `/v1/knowledge/documents/${documentId}/archive`,
      ...(requestId ? { requestId } : {}),
    });
    return NextResponse.json({ document: archived });
  } catch (error) {
    return mapKnowledgeBffError(error, 'Falha ao arquivar documento.');
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
  }
  const { documentId } = await context.params;
  if (!isUuid(documentId)) {
    return NextResponse.json(
      { error: 'Identificador inválido.', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }
  const requestId = req.headers.get('x-request-id') ?? undefined;
  const result = await getServerOrganizationContext(requestId ? { requestId } : {});
  const blocked = checkArchiveAccess(result);
  if (blocked) return blocked;
  const mismatch = checkKnowledgeOrgConsistency(req, result.context!.slug);
  if (mismatch) return mismatch;
  return executeArchiveRequest({
    context: result.context!,
    userId: result.user!.id,
    documentId,
    ...(requestId ? { requestId } : {}),
  });
}
