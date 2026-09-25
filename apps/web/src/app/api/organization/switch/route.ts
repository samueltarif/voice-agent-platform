import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '../../../../lib/auth/auth.js';
import { getBootstrapApiClient } from '../../../../lib/api/api-client-factory.js';
import {
  ACTIVE_ORGANIZATION_COOKIE_NAME,
  ACTIVE_ORGANIZATION_COOKIE_OPTIONS,
} from '../../../../lib/organization/active-organization-cookie.js';
import { switchOrganizationService } from '../../../../lib/organization/switch-organization-service.js';

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

async function extractJsonBody(
  req: NextRequest,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  try {
    const data = (await req.json()) as Record<string, unknown>;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Corpo da requisição JSON inválido.' },
        { status: 400 },
      ),
    };
  }
}

function buildSuccessResponse(organization: { slug: string; name: string }): NextResponse {
  const response = NextResponse.json({
    success: true,
    organization,
  });

  response.cookies.set(
    ACTIVE_ORGANIZATION_COOKIE_NAME,
    organization.slug,
    ACTIVE_ORGANIZATION_COOKIE_OPTIONS,
  );

  return response;
}

async function executeSwitch(
  userId: string,
  slug: unknown,
  requestId?: string,
): Promise<NextResponse> {
  const bootstrapClient = getBootstrapApiClient();
  const result = await switchOrganizationService.switchOrganization({
    userId,
    slug,
    bootstrapClient,
    requestId,
  });

  if (!result.success || !result.organization) {
    const errorMsg = result.error || 'Falha ao trocar organização.';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
  }

  return buildSuccessResponse(result.organization);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: 'Origem da requisição não autorizada.' },
      { status: 403 },
    );
  }

  const session = await auth.api.getSession({ headers: req.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Sessão de usuário não autenticada.' },
      { status: 401 },
    );
  }

  const bodyResult = await extractJsonBody(req);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const requestId = req.headers.get('x-request-id') || undefined;
  return executeSwitch(userId, bodyResult.data.slug, requestId);
}
