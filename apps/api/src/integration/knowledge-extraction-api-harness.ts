import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { vi } from 'vitest';
import type { TenantRole } from '@voice-agent/contracts';
import {
  DrizzleKnowledgeRepository,
  DrizzleKnowledgeRetrievalPreviewService,
  OrganizationRepository,
  type DatabaseInstance,
  type MembershipRepository,
} from '@voice-agent/database';
import { createKnowledgeUploadExtractor } from '@voice-agent/knowledge-extraction';
import type { Logger } from '@voice-agent/logger';
import { createApp } from '../app.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import type { ApiDependencies } from '../composition/agent-dependencies.js';

const KID = 'kb-upload-key';
const SUB = 'user-kb-upload';

/** SOMENTE TESTES (DEC-065): API real com ingestão, busca e extração reais. */
export interface ExtractionHarness {
  readonly orgA: string;
  readonly orgB: string;
  readonly logged: string[];
  readonly extractSpy: ReturnType<typeof vi.fn>;
  setRole(role: TenantRole): void;
  call(
    path: string,
    body: unknown,
    options?: { orgId?: string | undefined; raw?: string | undefined },
  ): Promise<Response>;
  anonymous(path: string): Promise<Response>;
}

function captureLogger(logged: string[]): Logger {
  const capture = (message: string, context?: unknown) =>
    void logged.push(`${message} ${JSON.stringify(context ?? {})}`);
  return { info: capture, warn: capture, error: capture, debug: capture };
}

async function createOrgs(db: DatabaseInstance): Promise<[string, string]> {
  const orgs = new OrganizationRepository(db);
  const run = Math.random().toString(36).slice(2, 8);
  const a = await orgs.createOrganization({ slug: `up-a-${run}`, name: 'A', status: 'ACTIVE' });
  const b = await orgs.createOrganization({ slug: `up-b-${run}`, name: 'B', status: 'ACTIVE' });
  return [a!.id, b!.id];
}

function signer(privateJwk: JWK) {
  return async (orgId: string) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub: SUB, orgId, iss: 'voice-agent:web', aud: 'voice-agent:api' })
      .setJti(`j-${Math.random()}`)
      .setProtectedHeader({ alg: 'EdDSA', kid: KID, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(await importJWK(privateJwk, 'EdDSA'));
  };
}

export async function createExtractionHarness(db: DatabaseInstance): Promise<ExtractionHarness> {
  const [orgA, orgB] = await createOrgs(db);
  const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const sign = signer({ ...(await exportJWK(keys.privateKey)), kid: KID });
  const publicJwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: KID }] };
  const logged: string[] = [];
  const extractor = createKnowledgeUploadExtractor();
  const extractSpy = vi.fn(extractor.extract);
  const active = new Set([orgA, orgB]);
  let role: TenantRole = 'OWNER';
  const app = createApp({
    logger: captureLogger(logged),
    verifier: new ServiceAssertionVerifier({ publicJwks }),
    bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks }),
    organizationRepo: {
      findOrganizationById: async ({ id }: { id: string }) =>
        active.has(id) ? { id, status: 'ACTIVE' } : null,
    } as unknown as OrganizationRepository,
    membershipRepo: {
      findMembership: async (q: { organizationId: string; userId: string }) =>
        active.has(q.organizationId) && q.userId === SUB ? { ...q, role, status: 'ACTIVE' } : null,
    } as unknown as MembershipRepository,
    knowledgeRepo: new DrizzleKnowledgeRepository(db),
    knowledgeRetrievalPreview: new DrizzleKnowledgeRetrievalPreviewService(db),
    knowledgeExtraction: { extract: extractSpy },
  } as unknown as ApiDependencies);
  return {
    orgA,
    orgB,
    logged,
    extractSpy,
    setRole: (next) => void (role = next),
    async call(path, body, options = {}) {
      const token = await sign(options.orgId ?? orgA);
      return app.request(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: options.raw ?? JSON.stringify(body),
      });
    },
    anonymous: async (path) => app.request(path, { method: 'POST', body: '{}' }),
  };
}
