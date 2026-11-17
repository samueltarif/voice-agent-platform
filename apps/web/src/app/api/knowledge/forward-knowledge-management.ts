import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../lib/api/tenant-api-client.js';
import type { ActiveOrganizationContext } from '../../../lib/organization/active-organization-context.js';
import { isSameOriginRequest } from '../agents/is-same-origin-request.js';
import { mapKnowledgeBffError } from './knowledge-error-response.js';
import { checkKnowledgeOrgConsistency } from './knowledge-org-consistency.js';
import { readBoundedJsonBody } from './read-bounded-json-body.js';

/** Forma mínima de um schema do contrato (sem acoplar o app a uma biblioteca). */
interface BodySchema {
  safeParse(value: unknown): { success: boolean; data?: unknown };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KnowledgeManagementForward {
  readonly req: NextRequest;
  /** Ausente em operações sem documento (ex.: pré-visualização da busca). */
  readonly documentId?: string | undefined;
  /** Espelho de UX do RBAC; a autorização real é revalidada na API. */
  readonly allowedRoles: readonly string[];
  readonly method: 'PATCH' | 'PUT' | 'POST' | 'DELETE';
  readonly apiPath: string;
  /** Schema do contrato; corpo inválido nunca chega à API. */
  readonly bodySchema?: BodySchema | undefined;
  readonly fallbackMessage: string;
  /** Formato da resposta de sucesso; padrão `{ document }` (ou `{ deleted }`). */
  readonly wrapResult?: ((result: unknown) => unknown) | undefined;
  /**
   * Corpos grandes (envio de arquivo): o acesso é verificado ANTES de ler o
   * corpo, e a leitura para ao passar deste teto (413).
   */
  readonly maxBodyBytes?: number | undefined;
  /** Prazo da chamada à API; padrão o do cliente interno. */
  readonly timeoutMs?: number | undefined;
}

function json(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

type BodyRead = { readonly body: unknown } | NextResponse;

async function readRawJson(options: KnowledgeManagementForward) {
  if (options.maxBodyBytes !== undefined) {
    return readBoundedJsonBody(options.req, options.maxBodyBytes);
  }
  try {
    return { kind: 'OK' as const, value: (await options.req.json()) as unknown };
  } catch {
    return { kind: 'INVALID' as const };
  }
}

async function readBody(options: KnowledgeManagementForward): Promise<BodyRead> {
  if (!options.bodySchema) return { body: undefined };
  const raw = await readRawJson(options);
  if (raw.kind === 'TOO_LARGE') return json(413, 'Arquivo grande demais.', 'PAYLOAD_TOO_LARGE');
  const parsed = raw.kind === 'OK' ? options.bodySchema.safeParse(raw.value) : null;
  if (!parsed?.success) return json(400, 'Dados do documento inválidos.', 'VALIDATION_ERROR');
  return { body: parsed.data ?? null };
}

async function resolveAccess(options: KnowledgeManagementForward, requestId?: string) {
  const result = await getServerOrganizationContext(requestId ? { requestId } : {});
  if (result.status === 'UNAUTHENTICATED') {
    return { blocked: json(401, 'Sessão expirada. Entre novamente.', 'UNAUTHENTICATED') };
  }
  if (result.status !== 'RESOLVED' || !result.context || !result.user) {
    return { blocked: json(403, 'Acesso não autorizado.', 'FORBIDDEN') };
  }
  if (!options.allowedRoles.includes(result.context.role)) {
    return { blocked: json(403, 'Seu papel não permite esta operação.', 'FORBIDDEN') };
  }
  const mismatch = checkKnowledgeOrgConsistency(options.req, result.context.slug);
  if (mismatch) return { blocked: mismatch };
  return { context: result.context, userId: result.user.id };
}

function rejectRequestShape(options: KnowledgeManagementForward): NextResponse | null {
  if (!isSameOriginRequest(options.req)) {
    return json(403, 'Origem da requisição não autorizada.', 'FORBIDDEN');
  }
  if (options.documentId !== undefined && !UUID.test(options.documentId)) {
    return json(400, 'Identificador inválido.', 'VALIDATION_ERROR');
  }
  return null;
}

/**
 * BFF das operações de gestão (DEC-054): mesma origem, ID válido, sessão,
 * papel, organização da tela = organização ativa e corpo validado pelo contrato.
 * Com `maxBodyBytes` (DEC-065), o corpo só é lido depois do acesso comprovado.
 */
export async function forwardKnowledgeManagement(
  options: KnowledgeManagementForward,
): Promise<NextResponse> {
  const rejected = rejectRequestShape(options);
  if (rejected) return rejected;
  const accessFirst = options.maxBodyBytes !== undefined;
  const early = accessFirst ? null : await readBody(options);
  if (early instanceof NextResponse) return early;
  const requestId = options.req.headers.get('x-request-id') ?? undefined;
  const access = await resolveAccess(options, requestId);
  if ('blocked' in access) return access.blocked!;
  const read = early ?? (await readBody(options));
  if (read instanceof NextResponse) return read;
  return callTenantApi({ options, access, body: read.body, requestId });
}

interface TenantCall {
  readonly options: KnowledgeManagementForward;
  readonly access: { readonly context: ActiveOrganizationContext; readonly userId: string };
  readonly body: unknown;
  readonly requestId: string | undefined;
}

async function callTenantApi({ options, access, body, requestId }: TenantCall) {
  try {
    const tenant = new TenantApiClient(getInternalApiClient(), access.context, access.userId);
    const result = await tenant.request({
      method: options.method,
      path: options.apiPath,
      ...(body !== undefined ? { body } : {}),
      ...(requestId ? { requestId } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });
    if (options.wrapResult) return NextResponse.json(options.wrapResult(result));
    return NextResponse.json(
      options.method === 'DELETE' ? { deleted: true } : { document: result },
    );
  } catch (error) {
    return mapKnowledgeBffError(error, options.fallbackMessage);
  }
}
