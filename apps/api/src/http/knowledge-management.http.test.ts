import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { generateKeyPair, exportJWK, importJWK, SignJWT, type JWK } from 'jose';
import { AppError } from '@voice-agent/errors';
import { createNullLogger } from '@voice-agent/logger';
import type { OrganizationRepository, MembershipRepository } from '@voice-agent/database';
import type {
  KnowledgeDocument,
  KnowledgeManagementPort,
  KnowledgeMutationActor,
  TenantRole,
} from '@voice-agent/contracts';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import type { ApiDependencies } from '../composition/agent-dependencies.js';

/** DEC-054: rotas de gestão — RBAC, organização da asserção, validação e erros estáveis. */
describe('HTTP /v1 knowledge document management', () => {
  const kid = 'kb-manage-key';
  const orgId = '11111111-1111-1111-1111-111111111111';
  const otherOrgId = '99999999-9999-9999-9999-999999999999';
  const docId = '22222222-2222-2222-2222-222222222222';
  const agentId = '33333333-3333-3333-3333-333333333333';
  const sub = 'user-kb-manage';
  const stamp = '2026-11-11T12:00:00.000Z';
  const doc: KnowledgeDocument = {
    id: docId,
    organizationId: orgId,
    title: 'Catálogo',
    source: { sourceType: 'PRODUCT_MANUAL', locator: 'catalogo.md' },
    status: 'READY',
    createdAt: new Date(stamp),
    updatedAt: new Date(stamp),
  };
  let privateJwk: JWK;
  let app: ReturnType<typeof createApp>;
  let deps: ApiDependencies;
  let role: TenantRole = 'OWNER';
  let calls: { method: string; input: unknown }[] = [];
  let failWith: AppError | null = null;

  function record(method: string) {
    return async (input: KnowledgeMutationActor) => {
      calls.push({ method, input });
      if (failWith) throw failWith;
      return doc;
    };
  }

  const service: KnowledgeManagementPort = {
    updateDocument: record('update'),
    setDocumentAgent: record('agent'),
    restoreDocument: record('restore'),
    deleteDocument: async (input) => {
      await record('delete')(input);
    },
  };

  beforeAll(async () => {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = { ...(await exportJWK(pair.privateKey)), kid };
    const publicJwk = { ...(await exportJWK(pair.publicKey)), kid };
    deps = {
      logger: createNullLogger(),
      verifier: new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      agentRepo: {} as ApiDependencies['agentRepo'],
      versionRepo: {} as ApiDependencies['versionRepo'],
      lifecycleService: {} as ApiDependencies['lifecycleService'],
      draftService: {} as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {} as ApiDependencies['publicationService'],
      userOrgContextRepo: {} as ApiDependencies['userOrgContextRepo'],
      organizationRepo: {
        findOrganizationById: async ({ id }: { id: string }) =>
          id === orgId || id === otherOrgId ? { id, status: 'ACTIVE' } : null,
      } as unknown as OrganizationRepository,
      membershipRepo: {
        findMembership: async (q: { organizationId: string; userId: string }) =>
          q.organizationId === orgId && q.userId === sub ? { ...q, role, status: 'ACTIVE' } : null,
      } as unknown as MembershipRepository,
      knowledgeManagement: service,
    };
    app = createApp(deps);
  });

  beforeEach(() => {
    role = 'OWNER';
    calls = [];
    failWith = null;
  });

  async function token(org = orgId): Promise<string> {
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub,
      orgId: org,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      jti: `j-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(key);
  }

  async function send(method: string, path: string, body?: unknown, org = orgId) {
    return app.request(path, {
      method,
      headers: { Authorization: `Bearer ${await token(org)}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  const base = `/v1/knowledge/documents/${docId}`;
  const routes = {
    update: () => send('PATCH', base, { expectedUpdatedAt: stamp, title: 'Novo' }),
    agent: () => send('PUT', `${base}/agent`, { expectedUpdatedAt: stamp, agentId }),
    restore: () => send('POST', `${base}/restore`, { expectedUpdatedAt: stamp }),
    delete: () => send('DELETE', `${base}?expectedUpdatedAt=${encodeURIComponent(stamp)}`),
  } as const;

  it('OWNER and ADMIN can use every management route; the organization comes from the assertion', async () => {
    for (const r of ['OWNER', 'ADMIN'] as const) {
      role = r;
      for (const call of Object.values(routes)) expect((await call()).status).toBe(200);
    }
    expect(calls.map((c) => c.method)).toEqual([
      'update',
      'agent',
      'restore',
      'delete',
      'update',
      'agent',
      'restore',
      'delete',
    ]);
    for (const c of calls) {
      expect(c.input).toMatchObject({
        organizationId: orgId,
        documentId: docId,
        actorId: sub,
        expectedUpdatedAt: stamp,
      });
    }
  });

  it('MANAGER may only edit; OPERATOR and VIEWER may do nothing', async () => {
    role = 'MANAGER';
    expect((await routes.update()).status).toBe(200);
    for (const call of [routes.agent, routes.restore, routes.delete]) {
      expect((await call()).status).toBe(403);
    }
    for (const r of ['OPERATOR', 'VIEWER'] as const) {
      role = r;
      for (const call of Object.values(routes)) expect((await call()).status).toBe(403);
    }
    expect(calls.map((c) => c.method)).toEqual(['update']);
  });

  it('rejects a member of another organization without touching the service', async () => {
    const res = await send('PATCH', base, { expectedUpdatedAt: stamp, title: 'x' }, otherOrgId);
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('validates ids and bodies before reaching the service', async () => {
    const invalid = [
      send('PATCH', '/v1/knowledge/documents/not-a-uuid', { expectedUpdatedAt: stamp, title: 'x' }),
      send('PATCH', base, { title: 'sem token' }),
      send('PATCH', base, { expectedUpdatedAt: stamp, title: '' }),
      send('PATCH', base, { expectedUpdatedAt: stamp, organizationId: otherOrgId }),
      send('PUT', `${base}/agent`, { expectedUpdatedAt: stamp, agentId: 'nope' }),
      send('PUT', `${base}/agent`, { expectedUpdatedAt: stamp }),
      send('POST', `${base}/restore`, {}),
      send('DELETE', base),
    ];
    for (const res of await Promise.all(invalid)) expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('accepts null to release the document to every agent and to clear the collection', async () => {
    expect(
      (await send('PUT', `${base}/agent`, { expectedUpdatedAt: stamp, agentId: null })).status,
    ).toBe(200);
    expect((await send('PATCH', base, { expectedUpdatedAt: stamp, collection: null })).status).toBe(
      200,
    );
    expect(calls[0]!.input).toMatchObject({ agentId: null });
    expect(calls[1]!.input).toMatchObject({ collection: null });
  });

  it('returns the stable domain error code and status', async () => {
    failWith = new AppError('changed', 409, 'KNOWLEDGE_STALE_UPDATE');
    const res = await routes.update();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'KNOWLEDGE_STALE_UPDATE',
    );
  });

  it('archive route now passes the acting user so the archive is audited', async () => {
    const archiveCalls: unknown[][] = [];
    const knowledgeRepo = {
      getDocumentById: async () => doc,
      archiveDocument: async (...args: unknown[]) => {
        archiveCalls.push(args);
        return { ...doc, status: 'ARCHIVED' as const };
      },
    } as unknown as ApiDependencies['knowledgeRepo'];
    const archiveApp = createApp({ ...deps, knowledgeRepo });
    const res = await archiveApp.request(`${base}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(200);
    expect(archiveCalls).toEqual([[orgId, docId, sub]]);
  });
});
