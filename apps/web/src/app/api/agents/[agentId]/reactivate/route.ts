import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';
import { isSameOriginRequest } from '../../is-same-origin-request.js';
import { canArchiveAgent } from '../../../../../features/agents/agent-permissions.js';
import { mapDraftApiError } from '../draft/draft-error-response.js';

interface RouteContext {
  params: Promise<{ agentId: string }>;
}

function checkOrgAuthorization(result: Awaited<ReturnType<typeof getServerOrganizationContext>>) {
  if (result.status === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Sessão não autenticada.' }, { status: 401 });
  }
  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });
  }
  if (!canArchiveAgent(result.context.role)) {
    return NextResponse.json(
      { error: 'Permissão insuficiente para reativar agentes.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }
  return null;
}

async function resolveTenantClient(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return {
      error: NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 }),
    };
  }

  const requestId = req.headers.get('x-request-id') ?? undefined;
  const result = await getServerOrganizationContext(requestId !== undefined ? { requestId } : {});
  const authError = checkOrgAuthorization(result);
  if (authError || !result.context || !result.user) {
    return {
      error: authError ?? NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 }),
    };
  }

  const internalClient = getInternalApiClient();
  const tenantClient = new TenantApiClient(internalClient, result.context, result.user.id);

  return { tenantClient, requestId };
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const resolved = await resolveTenantClient(req);
  if ('error' in resolved) return resolved.error;

  const { agentId } = await params;

  try {
    const reactivated = await resolved.tenantClient.request({
      method: 'POST',
      path: `/v1/agents/${agentId}/reactivate`,
      ...(resolved.requestId ? { requestId: resolved.requestId } : {}),
    });

    return NextResponse.json(reactivated, { status: 200 });
  } catch (error) {
    return mapDraftApiError(error);
  }
}
