import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import type { TenantRole } from '@voice-agent/contracts';
import type {
  DatabaseInstance,
  MembershipRepository,
  OrganizationRepository,
} from '@voice-agent/database';
import { createNullLogger } from '@voice-agent/logger';
import { createApp } from '../app.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { createSchedulingDependencies } from '../composition/scheduling-dependencies.js';

/**
 * E1 (DEC-074) — app HTTP real com repositórios reais de agenda/leads sobre
 * um banco descartável; organização e vínculo são simulados (papel variável).
 */
export interface SchedulingApiBody {
  readonly status?: string;
  readonly lead?: { readonly id: string; readonly status: string };
  readonly meeting?: Readonly<Record<string, unknown>> & {
    readonly id: string;
    readonly version: number;
  };
  readonly calendar?: { readonly id: string };
  readonly items?: ReadonlyArray<
    Readonly<Record<string, unknown>> & { readonly id: string; readonly startsAt: string }
  >;
  readonly exceptions?: ReadonlyArray<{ readonly id: string; readonly localDate: string }>;
  readonly error?: { readonly code: string; readonly reason?: string };
  readonly phoneSuppressed?: boolean;
  readonly history?: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly paths?: Readonly<Record<string, unknown>>;
}

export interface SchedulingApiResponse {
  readonly status: number;
  readonly json: SchedulingApiBody;
}

export interface SchedulingApiHarness {
  role: TenantRole;
  /** Status do vínculo devolvido pelo banco simulado (ex.: `SUSPENDED` = revogado). */
  membershipStatus: string;
  get(path: string, orgId: string): Promise<SchedulingApiResponse>;
  post(path: string, orgId: string, body: unknown): Promise<SchedulingApiResponse>;
  put(path: string, orgId: string, body: unknown): Promise<SchedulingApiResponse>;
  delete(path: string, orgId: string): Promise<SchedulingApiResponse>;
  /** Requisição sem asserção de serviço (não autenticada). */
  anonymous(method: string, path: string): Promise<SchedulingApiResponse>;
}

interface SignedRequest {
  readonly method: string;
  readonly path: string;
  readonly orgId: string;
  readonly body?: unknown;
}

const SUB = 'user-scheduling-api';
const KID = 'scheduling-key';

async function createKeys() {
  const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const privateJwk: JWK = { ...(await exportJWK(keys.privateKey)), kid: KID };
  const publicJwk = { ...(await exportJWK(keys.publicKey)), kid: KID };
  return { privateJwk, publicJwk };
}

async function signAssertion(privateJwk: JWK, orgId: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: SUB,
    orgId,
    iss: 'voice-agent:web',
    aud: 'voice-agent:api',
    jti: `j-${Math.random()}`,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: KID, typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 30)
    .sign(await importJWK(privateJwk, 'EdDSA'));
}

function tenantStubs(active: ReadonlySet<string>, harness: SchedulingApiHarness) {
  const findMembership = async (input: { organizationId: string; userId: string }) =>
    active.has(input.organizationId) && input.userId === SUB
      ? { ...input, role: harness.role, status: harness.membershipStatus }
      : null;
  return {
    organizationRepo: {
      findOrganizationById: async ({ id }: { id: string }) =>
        active.has(id) ? { id, status: 'ACTIVE' } : null,
    } as unknown as OrganizationRepository,
    membershipRepo: { findMembership } as unknown as MembershipRepository,
  };
}

export async function createSchedulingApiHarness(input: {
  readonly db: DatabaseInstance;
  readonly activeOrganizations: readonly string[];
  readonly now: Date;
}): Promise<SchedulingApiHarness> {
  const { privateJwk, publicJwk } = await createKeys();
  const harness = { role: 'OWNER', membershipStatus: 'ACTIVE' } as SchedulingApiHarness;
  const app = createApp({
    logger: createNullLogger(),
    verifier: new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
    bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
    ...tenantStubs(new Set(input.activeOrganizations), harness),
    scheduling: createSchedulingDependencies(input.db, () => input.now),
  } as unknown as ApiDependencies);
  const send = async (request: SignedRequest): Promise<SchedulingApiResponse> => {
    const token = await signAssertion(privateJwk, request.orgId);
    const response = await app.request(request.path, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    return { status: response.status, json: (await response.json()) as SchedulingApiBody };
  };
  harness.get = (path, orgId) => send({ method: 'GET', path, orgId });
  harness.post = (path, orgId, body) => send({ method: 'POST', path, orgId, body });
  harness.put = (path, orgId, body) => send({ method: 'PUT', path, orgId, body });
  harness.delete = (path, orgId) => send({ method: 'DELETE', path, orgId });
  harness.anonymous = async (method, path) => {
    const response = await app.request(path, { method });
    return { status: response.status, json: (await response.json()) as SchedulingApiBody };
  };
  return harness;
}
