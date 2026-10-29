import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../lib/organization/server-organization-context.js';
import { isValidOrganizationSlug } from '../../lib/organization/active-organization-context.js';
import { getInternalApiClient } from '../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../lib/api/tenant-api-client.js';
import { OPERATIONS_ORG_HEADER } from '../../lib/operations/operations-org-header.js';
import { isSameOriginRequest } from './agents/is-same-origin-request.js';
import { DEFAULT_OPERATION_BODY_BYTES, readBoundedBody } from './bounded-body.js';

const json = (code: string, status: number) => NextResponse.json({ code }, { status });

/** Código estável da API; o texto exibido é sempre resolvido na UI (pt-BR seguro). */
function codeOf(error: unknown, status: number): string {
  const data = (error as { data?: { error?: { code?: unknown } } })?.data;
  const code = data?.error?.code;
  if (typeof code === 'string' && /^[A-Z_]{2,64}$/.test(code)) return code;
  return status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'API_ERROR';
}

export function mapOperationsError(error: unknown): NextResponse {
  const status = (error as { status?: unknown })?.status;
  if (typeof status !== 'number' || status < 400 || status >= 500) {
    return json('INTERNAL_SERVER_ERROR', 500);
  }
  return json(codeOf(error, status), status);
}

function checkDeclaredOrg(req: NextRequest, activeSlug: string): NextResponse | null {
  const declared = req.headers.get(OPERATIONS_ORG_HEADER);
  if (!declared || !isValidOrganizationSlug(declared)) return json('ORG_CONTEXT_REQUIRED', 400);
  return declared === activeSlug ? null : json('ORG_CONTEXT_MISMATCH', 409);
}

/**
 * Pipeline comum do BFF de operações: mesma origem → sessão e organização
 * ativas → organização declarada pela tela → chamada à API com assertion de
 * serviço do usuário. O RBAC é aplicado pela API (fonte única); erros viram
 * códigos estáveis, nunca mensagens internas.
 */
export async function runTenantOperation(
  req: NextRequest,
  run: (tenant: TenantApiClient) => Promise<NextResponse>,
): Promise<NextResponse> {
  const tenant = await resolveTenant(req);
  if (tenant instanceof NextResponse) return tenant;
  try {
    return await run(tenant);
  } catch (error) {
    return mapOperationsError(error);
  }
}

async function resolveTenant(req: NextRequest): Promise<TenantApiClient | NextResponse> {
  if (!isSameOriginRequest(req)) return json('ORIGIN_NOT_ALLOWED', 403);
  const requestId = req.headers.get('x-request-id');
  const result = await getServerOrganizationContext(requestId ? { requestId } : {});
  if (result.status === 'UNAUTHENTICATED') return json('UNAUTHENTICATED', 401);
  if (result.status !== 'RESOLVED' || !result.context || !result.user)
    return json('FORBIDDEN', 403);
  return (
    checkDeclaredOrg(req, result.context.slug) ??
    new TenantApiClient(getInternalApiClient(), result.context, result.user.id)
  );
}

/** Qualquer schema com `safeParse` (os schemas Zod de `@voice-agent/contracts`). */
interface SafeParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Corpo JSON validado e limitado; inválido → 400, acima do teto → 413 (sem detalhes). */
export async function parseJsonBody<T>(
  req: NextRequest,
  schema: SafeParser<T>,
  maxBytes: number = DEFAULT_OPERATION_BODY_BYTES,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const body = await readBoundedBody(req, maxBytes);
  if (body.kind === 'TOO_LARGE') return { ok: false, response: json('PAYLOAD_TOO_LARGE', 413) };
  let raw: unknown;
  try {
    raw = JSON.parse(body.text);
  } catch {
    return { ok: false, response: json('VALIDATION_ERROR', 400) };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: json('VALIDATION_ERROR', 400) };
}
