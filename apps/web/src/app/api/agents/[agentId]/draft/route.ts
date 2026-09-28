import { NextResponse, type NextRequest } from 'next/server';
import { createDraftHttpBodySchema, updateDraftHttpBodySchema } from '@voice-agent/contracts';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';
import { isSameOriginRequest } from '../../is-same-origin-request.js';
import { canEditAgent } from '../../../../../features/agents/agent-permissions.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../../features/agents/agent-default-configuration.js';
import { mapDraftApiError } from './draft-error-response.js';

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
  if (!canEditAgent(result.context.role)) {
    return NextResponse.json(
      { error: 'Permissão insuficiente para gerenciar rascunhos.', code: 'FORBIDDEN' },
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

async function parseCreateDraftBody(req: NextRequest) {
  const text = await req.text();
  if (text.trim().length === 0) {
    return { data: { configuration: DEFAULT_AGENT_CONFIGURATION_V1 } };
  }
  const parsed = JSON.parse(text);
  const validated = createDraftHttpBodySchema.safeParse({
    ...parsed,
    configuration: parsed.configuration ?? DEFAULT_AGENT_CONFIGURATION_V1,
  });
  if (!validated.success) {
    return {
      error: NextResponse.json(
        {
          error: validated.error.issues[0]?.message ?? 'Dados inválidos.',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 },
      ),
    };
  }
  return { data: validated.data };
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const resolved = await resolveTenantClient(req);
  if ('error' in resolved) return resolved.error;

  const parsedBody = await parseCreateDraftBody(req);
  if ('error' in parsedBody) return parsedBody.error;

  const { agentId } = await params;
  try {
    const draft = await resolved.tenantClient.request({
      method: 'POST',
      path: `/v1/agents/${agentId}/drafts`,
      body: parsedBody.data,
      ...(resolved.requestId ? { requestId: resolved.requestId } : {}),
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    return mapDraftApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const resolved = await resolveTenantClient(req);
  if ('error' in resolved) return resolved.error;

  const { agentId } = await params;
  const versionId = req.nextUrl.searchParams.get('versionId');

  if (!versionId) {
    return NextResponse.json(
      { error: 'Parâmetro versionId é obrigatório na query string.', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  try {
    const json = await req.json().catch(() => null);
    const validated = updateDraftHttpBodySchema.safeParse(json);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: validated.error.issues[0]?.message ?? 'Dados inválidos.',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 },
      );
    }

    const updated = await resolved.tenantClient.request({
      method: 'PATCH',
      path: `/v1/agents/${agentId}/drafts/${versionId}`,
      body: validated.data,
      ...(resolved.requestId ? { requestId: resolved.requestId } : {}),
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return mapDraftApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const resolved = await resolveTenantClient(req);
  if ('error' in resolved) return resolved.error;

  const { agentId } = await params;
  const versionId = req.nextUrl.searchParams.get('versionId');

  if (!versionId) {
    return NextResponse.json(
      { error: 'Parâmetro versionId é obrigatório na query string.', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  try {
    const result = await resolved.tenantClient.request({
      method: 'DELETE',
      path: `/v1/agents/${agentId}/drafts/${versionId}`,
      ...(resolved.requestId ? { requestId: resolved.requestId } : {}),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapDraftApiError(error);
  }
}
