import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { KnowledgeProfilePolicy, TenantRole } from '@voice-agent/contracts';
import {
  AgentDraftService,
  AgentPublicationService,
  AgentVersionRepository,
  CommercialEntitlementResolver,
  DefaultCommercialPublicationPolicy,
  type MembershipRepository,
  type OrganizationRepository,
} from '@voice-agent/database';
import {
  createDisposableTestDatabase,
  createKnowledgeSimulationFixture,
  knowledgeSimulationConfig,
  type KnowledgeSimulationFixture,
} from '@voice-agent/database/test-support';
import { createNullLogger } from '@voice-agent/logger';
import { createApp } from '../app.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import type { ApiDependencies } from '../composition/agent-dependencies.js';

const tdb = await createDisposableTestDatabase('knowledge-profile-draft-api');

/**
 * B2a (DEC-071) — rotas de rascunho e publicação via HTTP real + PostgreSQL
 * descartável. O papel vem do banco (membership), nunca do corpo; a mudança é
 * comparada com o rascunho persistido; lista e chave da plataforma decidem.
 */
describe('perfil de busca nas rotas de rascunho e publicação (B2a)', () => {
  const kid = 'kb-profile-key';
  const sub = 'user-kb-profile';
  let privateJwk: JWK;
  let app: ReturnType<typeof createApp>;
  let fx: KnowledgeSimulationFixture;
  let role: TenantRole = 'OWNER';
  const gates = { orgs: new Set<string>(), runtime: false };
  const policy: KnowledgeProfilePolicy = {
    isOrganizationAllowed: (id) => gates.orgs.has(id),
    isRuntimeEnabled: () => gates.runtime,
  };

  beforeAll(async () => {
    fx = await createKnowledgeSimulationFixture(tdb.db, Math.random().toString(36).slice(2, 8));
    const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = { ...(await exportJWK(keys.privateKey)), kid };
    const publicJwk = { ...(await exportJWK(keys.publicKey)), kid };
    const resolver = new CommercialEntitlementResolver(tdb.db);
    app = createApp({
      logger: createNullLogger(),
      verifier: new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      organizationRepo: {
        findOrganizationById: async ({ id }: { id: string }) => ({ id, status: 'ACTIVE' }),
      } as unknown as OrganizationRepository,
      membershipRepo: {
        findMembership: async (q: { organizationId: string; userId: string }) =>
          q.userId === sub ? { ...q, role, status: 'ACTIVE' } : null,
      } as unknown as MembershipRepository,
      draftService: new AgentDraftService(tdb.db, policy),
      publicationService: new AgentPublicationService(
        tdb.db,
        new DefaultCommercialPublicationPolicy(tdb.db, resolver),
        policy,
      ),
    } as unknown as ApiDependencies);
  }, 180_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  beforeEach(() => {
    role = 'OWNER';
    gates.orgs.clear();
    gates.runtime = false;
  });

  async function call(method: string, path: string, body?: unknown) {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub,
      orgId: fx.orgA,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      jti: `j-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(await importJWK(privateJwk, 'EdDSA'));
    return app.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const draftId = async (agentId: string) =>
    (
      await new AgentVersionRepository(tdb.db).listVersionsByAgent({
        organizationId: fx.orgA,
        agentId,
      })
    ).find((v) => v.status === 'DRAFT')!.id;
  const configuration = (
    profile?: 'v1' | 'v2',
    objective = 'Responder dúvidas sobre o catálogo',
  ) => {
    const base = knowledgeSimulationConfig(['knowledge.search']);
    return {
      ...base,
      persona: { ...base.persona, objective },
      ...(profile ? { knowledge: { retrievalProfile: profile } } : {}),
    };
  };
  const patch = async (body: unknown) =>
    call('PATCH', `/v1/agents/${fx.draftOnly}/drafts/${await draftId(fx.draftOnly)}`, body);
  const codeOf = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error.code;

  it('lista vazia: nem OWNER grava o perfil; resposta igual para qualquer motivo', async () => {
    for (const r of ['OWNER', 'ADMIN', 'MANAGER'] as const) {
      role = r;
      const res = await patch({ configuration: configuration('v2') });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('KNOWLEDGE_PROFILE_NOT_AUTHORIZED');
    }
  });

  it('o cliente não consegue se declarar autorizado pelo corpo (schema estrito)', async () => {
    gates.orgs.add(fx.orgA);
    role = 'MANAGER';
    for (const extra of [{ actorRole: 'OWNER' }, { canManageKnowledgeProfile: true }]) {
      expect((await patch({ configuration: configuration('v2'), ...extra })).status).toBe(400);
    }
    const res = await patch({
      configuration: { ...configuration(), knowledge: { retrievalProfile: 'v2', allow: true } },
    });
    expect(res.status).toBe(400);
  });

  it('organização liberada: OWNER muda; MANAGER edita o resto sem mudar o perfil', async () => {
    gates.orgs.add(fx.orgA);
    role = 'MANAGER';
    expect((await patch({ configuration: configuration('v2') })).status).toBe(403);
    role = 'OWNER';
    expect((await patch({ configuration: configuration('v2') })).status).toBe(200);
    role = 'MANAGER';
    expect((await patch({ configuration: configuration('v2', 'Outro objetivo') })).status).toBe(
      200,
    );
    expect((await patch({ configuration: configuration('v1') })).status).toBe(403);
    expect((await patch({ configuration: configuration(undefined) })).status).toBe(403);
  });

  it('publicação v2 recusada com a chave desligada; o rascunho continua rascunho', async () => {
    gates.orgs.add(fx.orgA);
    const id = await draftId(fx.draftOnly);
    expect((await patch({ configuration: configuration('v2') })).status).toBe(200);
    const res = await call('POST', `/v1/agents/${fx.draftOnly}/drafts/${id}/publish`);
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('KNOWLEDGE_PROFILE_NOT_AUTHORIZED');
    expect(await draftId(fx.draftOnly)).toBe(id);
    // MANAGER nem chega à regra: não tem `agent.publish`.
    role = 'MANAGER';
    expect((await call('POST', `/v1/agents/${fx.draftOnly}/drafts/${id}/publish`)).status).toBe(
      403,
    );
  });
});
