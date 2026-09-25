import { NextResponse, type NextRequest } from 'next/server';
import { createAgentHttpBodySchema, type CreateAgentHttpBody } from '@voice-agent/contracts';
import {
  getServerOrganizationContext,
  type ServerOrganizationContextResult,
} from '../../../lib/organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../lib/api/tenant-api-client.js';
import { mapCreateAgentError } from './agent-error-response.js';
import { isSameOriginRequest } from './is-same-origin-request.js';

function checkResolutionAccess(result: ServerOrganizationContextResult): NextResponse | null {
  if (result.status === 'UNAUTHENTICATED') {
    return NextResponse.json(
      { error: 'Nenhuma organização ativa selecionada ou sessão não autenticada.' },
      { status: 401 },
    );
  }

  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    return NextResponse.json(
      { error: 'Nenhuma organização ativa selecionada ou acesso não autorizado.' },
      { status: 403 },
    );
  }

  return null;
}

function hasCreatePermission(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

async function queryTenantAgents(
  context: ActiveOrganizationContext,
  userId: string,
  requestId?: string,
): Promise<NextResponse> {
  try {
    const internalClient = getInternalApiClient();
    const tenantClient = new TenantApiClient(internalClient, context, userId);
    const agents = await tenantClient.request({
      method: 'GET',
      path: '/v1/agents',
      ...(requestId !== undefined ? { requestId } : {}),
    });

    return NextResponse.json({
      organization: { slug: context.slug, name: context.name },
      agents,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao buscar agentes da organização.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
  }

  const requestId = req.headers.get('x-request-id') ?? undefined;
  const result = await getServerOrganizationContext(requestId !== undefined ? { requestId } : {});

  const accessError = checkResolutionAccess(result);
  if (accessError) {
    return accessError;
  }

  return queryTenantAgents(result.context!, result.user!.id, requestId);
}

interface ExecuteCreateAgentOptions {
  readonly context: ActiveOrganizationContext;
  readonly userId: string;
  readonly body: CreateAgentHttpBody;
  readonly requestId?: string | undefined;
}

async function executeCreateAgent(options: ExecuteCreateAgentOptions): Promise<NextResponse> {
  try {
    const internalClient = getInternalApiClient();
    const tenantClient = new TenantApiClient(internalClient, options.context, options.userId);
    const created = await tenantClient.request({
      method: 'POST',
      path: '/v1/agents',
      body: options.body,
      ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapCreateAgentError(error);
  }
}

type ParsePayloadResult =
  | { readonly ok: true; readonly data: CreateAgentHttpBody }
  | { readonly ok: false; readonly response: NextResponse };

async function parseCreateAgentPayload(req: NextRequest): Promise<ParsePayloadResult> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Corpo da requisição JSON inválido.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      ),
    };
  }

  const parseResult = createAgentHttpBodySchema.safeParse(rawBody);
  if (!parseResult.success) {
    const message = parseResult.error.issues.map((i) => i.message).join('; ');
    return {
      ok: false,
      response: NextResponse.json(
        { error: message || 'Dados do agente inválidos.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parseResult.data };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
  }

  const requestId = req.headers.get('x-request-id') ?? undefined;
  const result = await getServerOrganizationContext(requestId !== undefined ? { requestId } : {});

  const accessError = checkResolutionAccess(result);
  if (accessError) {
    return accessError;
  }

  if (!hasCreatePermission(result.context!.role)) {
    return NextResponse.json(
      { error: 'Permissão insuficiente para criar agentes na organização.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  const payloadResult = await parseCreateAgentPayload(req);
  if (!payloadResult.ok) {
    return payloadResult.response;
  }

  return executeCreateAgent({
    context: result.context!,
    userId: result.user!.id,
    body: payloadResult.data,
    requestId,
  });
}
