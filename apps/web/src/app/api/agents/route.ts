import { NextResponse, type NextRequest } from 'next/server';
import {
  getServerOrganizationContext,
  type ServerOrganizationContextResult,
} from '../../../lib/organization/server-organization-context.js';
import type { ActiveOrganizationContext } from '../../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../lib/api/tenant-api-client.js';

function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    const fetchSite = req.headers.get('sec-fetch-site');
    return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site';
  }

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

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
