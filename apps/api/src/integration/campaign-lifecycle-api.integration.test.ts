import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantRole } from '@voice-agent/contracts';
import {
  DrizzleCampaignLifecycleRepository,
  DrizzleContactRepository,
  DrizzleContactSuppressionRepository,
  DrizzleOutboundRepository,
  type MembershipRepository,
  type OrganizationRepository,
} from '@voice-agent/database';
import {
  createDisposableTestDatabase,
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from '@voice-agent/database/test-support';
import { createNullLogger } from '@voice-agent/logger';
import { createApp } from '../app.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import type { ApiDependencies } from '../composition/agent-dependencies.js';

const tdb = await createDisposableTestDatabase('campaign-lifecycle-api');

/** 008-MVP2 — ciclo de vida de campanha via HTTP real + repositórios reais + PostgreSQL. */
describe('008-MVP2 campaign lifecycle API (HTTP + PostgreSQL)', () => {
  const kid = 'contacts-key';
  const sub = 'user-contacts';
  let privateJwk: JWK;
  let app: ReturnType<typeof createApp>;
  let fx: DurableOutboundFixture;
  let role: TenantRole = 'OWNER';

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = { ...(await exportJWK(keys.privateKey)), kid };
    const publicJwk = { ...(await exportJWK(keys.publicKey)), kid };
    const active = new Set([fx.tenantA.organizationId, fx.tenantB.organizationId]);
    app = createApp({
      logger: createNullLogger(),
      verifier: new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      organizationRepo: {
        findOrganizationById: async ({ id }: { id: string }) =>
          active.has(id) ? { id, status: 'ACTIVE' } : null,
      } as unknown as OrganizationRepository,
      membershipRepo: {
        findMembership: async ({
          organizationId,
          userId,
        }: {
          organizationId: string;
          userId: string;
        }) =>
          active.has(organizationId) && userId === sub
            ? { organizationId, userId, role, status: 'ACTIVE' }
            : null,
      } as unknown as MembershipRepository,
      contactRepo: new DrizzleContactRepository(tdb.db),
      suppressionRepo: new DrizzleContactSuppressionRepository(tdb.db),
      outboundRepo: new DrizzleOutboundRepository(tdb.db),
      campaignLifecycleRepo: new DrizzleCampaignLifecycleRepository(tdb.db),
    } as unknown as ApiDependencies);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function call(method: string, path: string, orgId: string, body?: unknown) {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      jti: `j-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(await importJWK(privateJwk, 'EdDSA'));
    const response = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      json: (await response.json()) as Record<string, unknown> & unknown[],
    };
  }

  async function campaignWithAudience(
    orgKey: 'tenantA' | 'tenantB',
    name: string,
    phones: string[],
  ) {
    const tenant = fx[orgKey];
    role = 'OWNER';
    const list = await call('POST', '/v1/contact-lists', tenant.organizationId, {
      name: `Lista ${name}`,
    });
    await call('POST', `/v1/contact-lists/${list.json.id}/imports`, tenant.organizationId, {
      csv: `Telefone\n${phones.join('\n')}`,
      mapping: { phoneColumn: 'Telefone' },
    });
    const campaign = await call('POST', '/v1/campaigns', tenant.organizationId, {
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
      name,
      status: 'DRAFT',
    });
    expect(campaign.status).toBe(201);
    const audience = await call(
      'PUT',
      `/v1/campaigns/${campaign.json.id}/audience`,
      tenant.organizationId,
      {
        contactListId: list.json.id,
      },
    );
    expect(audience.status).toBe(200);
    return String(campaign.json.id);
  }

  const action = (orgId: string, campaignId: string, value: string) =>
    call('POST', `/v1/campaigns/${campaignId}/actions`, orgId, { action: value });

  it('runs the full operational flow with real progress and stable rejection codes', async () => {
    const orgId = fx.tenantA.organizationId;
    const id = await campaignWithAudience('tenantA', 'Fluxo', ['11 95555-0001', '11 95555-0002']);
    await call('POST', '/v1/contact-suppressions', orgId, {
      phone: '11 95555-0002',
      reason: 'OPT_OUT',
    });
    expect(await action(orgId, id, 'START')).toEqual({
      status: 200,
      json: { status: 'ACTIVE', jobsCreated: 1, jobsCanceled: 0 },
    });
    expect((await call('GET', `/v1/campaigns/${id}/progress`, orgId)).json).toMatchObject({
      progress: { total: 1, scheduled: 1 },
      audience: { scheduledStartAt: null },
    });
    expect(await action(orgId, id, 'START')).toMatchObject({
      status: 409,
      json: { error: { code: 'INVALID_TRANSITION' } },
    });
    expect((await action(orgId, id, 'CANCEL')).json).toMatchObject({
      status: 'CANCELED',
      jobsCanceled: 1,
    });
  });

  it('lets operators halt but not start campaigns; viewers can do neither', async () => {
    const orgId = fx.tenantA.organizationId;
    const id = await campaignWithAudience('tenantA', 'RBAC', ['11 96666-0001']);
    role = 'OPERATOR';
    expect((await action(orgId, id, 'START')).status).toBe(403);
    role = 'MANAGER';
    expect((await action(orgId, id, 'START')).status).toBe(200);
    role = 'VIEWER';
    expect((await action(orgId, id, 'PAUSE')).status).toBe(403);
    role = 'OPERATOR';
    expect((await action(orgId, id, 'PAUSE')).json).toMatchObject({ status: 'PAUSED' });
    expect((await action(orgId, id, 'RESUME')).status).toBe(403);
  });

  it('hides other tenants campaigns and lists (404) and requires an audience to start', async () => {
    const id = await campaignWithAudience('tenantA', 'Privada', ['11 97777-0001']);
    role = 'OWNER';
    expect((await action(fx.tenantB.organizationId, id, 'CANCEL')).status).toBe(404);
    expect(
      (await call('GET', `/v1/campaigns/${id}/progress`, fx.tenantB.organizationId)).json,
    ).toMatchObject({
      progress: { total: 0 },
      audience: null,
    });
    const bare = await call('POST', '/v1/campaigns', fx.tenantB.organizationId, {
      agentId: fx.tenantB.agentId,
      agentVersionId: fx.tenantB.agentVersionId,
      name: 'Sem audiência',
      status: 'DRAFT',
    });
    expect(await action(fx.tenantB.organizationId, String(bare.json.id), 'START')).toMatchObject({
      status: 409,
      json: { error: { code: 'AUDIENCE_REQUIRED' } },
    });
    const foreignList = (await call('GET', '/v1/contact-lists', fx.tenantA.organizationId))
      .json as Array<{ id: string }>;
    const steal = await call(
      'PUT',
      `/v1/campaigns/${bare.json.id}/audience`,
      fx.tenantB.organizationId,
      {
        contactListId: foreignList[0]!.id,
      },
    );
    expect(steal).toMatchObject({ status: 404, json: { error: { code: 'LIST_NOT_FOUND' } } });
  });
});
