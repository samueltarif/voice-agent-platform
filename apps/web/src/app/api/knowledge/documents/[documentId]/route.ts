import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../../../../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';
import { mapKnowledgeBffError } from '../../knowledge-error-response.js';
import { isSameOriginRequest } from '../../../agents/is-same-origin-request.js';
import { checkKnowledgeOrgConsistency } from '../../knowledge-org-consistency.js';
import { forwardKnowledgeManagement } from '../../forward-knowledge-management.js';
import {
  knowledgeLifecycleHttpBodySchema,
  updateKnowledgeDocumentHttpBodySchema,
} from '@voice-agent/contracts';

type OrgContext = Awaited<ReturnType<typeof getServerOrganizationContext>>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function checkReadAccess(result: OrgContext): NextResponse | null {
  if (result.status === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Sessão não autenticada.' }, { status: 401 });
  }
  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });
  }
  if (!hasReadPermission(result.context.role)) {
    return NextResponse.json(
      { error: 'Permissão insuficiente.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }
  return null;
}

function hasReadPermission(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

interface ExecuteDetailOptions {
  readonly context: ActiveOrganizationContext;
  readonly userId: string;
  readonly documentId: string;
  readonly requestId?: string | undefined;
}

async function executeDetailFetch(options: ExecuteDetailOptions): Promise<NextResponse> {
  const { context, userId, documentId, requestId } = options;
  try {
    const tenant = new TenantApiClient(getInternalApiClient(), context, userId);
    const document = await tenant.request({
      method: 'GET',
      path: `/v1/knowledge/documents/${documentId}`,
      ...(requestId ? { requestId } : {}),
    });
    return NextResponse.json({ document });
  } catch (error) {
    return mapKnowledgeBffError(error, 'Falha ao buscar documento.');
  }
}

export async function GET(
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
  const blocked = checkReadAccess(result);
  if (blocked) return blocked;
  const mismatch = checkKnowledgeOrgConsistency(req, result.context!.slug);
  if (mismatch) return mismatch;
  return executeDetailFetch({
    context: result.context!,
    userId: result.user!.id,
    documentId,
    ...(requestId ? { requestId } : {}),
  });
}

/** Edita título, coleção, versão da fonte e/ou substitui o conteúdo (DEC-054). */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
): Promise<NextResponse> {
  const { documentId } = await context.params;
  return forwardKnowledgeManagement({
    req,
    documentId,
    allowedRoles: ['OWNER', 'ADMIN', 'MANAGER'],
    method: 'PATCH',
    apiPath: `/v1/knowledge/documents/${documentId}`,
    bodySchema: updateKnowledgeDocumentHttpBodySchema,
    fallbackMessage: 'Não foi possível salvar o documento.',
  });
}

/** Exclusão definitiva (só arquivado e sem agente). `expectedUpdatedAt` vem na query. */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
): Promise<NextResponse> {
  const { documentId } = await context.params;
  const expected = req.nextUrl.searchParams.get('expectedUpdatedAt') ?? '';
  if (!knowledgeLifecycleHttpBodySchema.safeParse({ expectedUpdatedAt: expected }).success) {
    return NextResponse.json(
      { error: 'Dados do documento inválidos.', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }
  return forwardKnowledgeManagement({
    req,
    documentId,
    allowedRoles: ['OWNER', 'ADMIN'],
    method: 'DELETE',
    apiPath: `/v1/knowledge/documents/${documentId}?expectedUpdatedAt=${encodeURIComponent(expected)}`,
    fallbackMessage: 'Não foi possível excluir o documento.',
  });
}
