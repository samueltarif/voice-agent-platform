import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantRole } from '@voice-agent/contracts';
import {
  DrizzleCampaignLifecycleRepository,
  DrizzleCampaignReportRepository,
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

const tdb = await createDisposableTestDatabase('campaign-report-api');

/** 008-MVP4 — relatório de campanha via HTTP real + repositórios reais + PostgreSQL. */
describe('008-MVP4 campaign report API (HTTP + PostgreSQL)', () => {
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
      campaignReportRepo: new DrizzleCampaignReportRepository(tdb.db),
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

  let campaignId = '';

  beforeAll(async () => {
    role = 'OWNER';
    const org = fx.tenantA.organizationId;
    const list = await call('POST', '/v1/contact-lists', org, { name: 'Lista relatório' });
    await call('POST', `/v1/contact-lists/${list.json.id}/imports`, org, {
      csv: 'Telefone\n11 98200-0001\n11 98200-0002',
      mapping: { phoneColumn: 'Telefone' },
    });
    const campaign = await call('POST', '/v1/campaigns', org, {
      agentId: fx.tenantA.agentId,
      agentVersionId: fx.tenantA.agentVersionId,
      name: 'Relatório HTTP',
      status: 'DRAFT',
    });
    campaignId = String(campaign.json.id);
    await call('PUT', `/v1/campaigns/${campaignId}/audience`, org, { contactListId: list.json.id });
    await call('POST', `/v1/campaigns/${campaignId}/actions`, org, { action: 'START' });
  });

  it('returns the report with costs only to roles that may see them', async () => {
    const org = fx.tenantA.organizationId;
    for (const [r, costsVisible] of [
      ['OWNER', true],
      ['MANAGER', true],
      ['OPERATOR', false],
      ['VIEWER', false],
    ] as const) {
      role = r;
      const res = await call('GET', `/v1/campaigns/${campaignId}/report`, org);
      expect([r, res.status, res.json.costs !== null]).toEqual([r, 200, costsVisible]);
      expect(res.json).toMatchObject({
        campaignStatus: 'ACTIVE',
        progress: { total: 2, scheduled: 2, inProgress: 0, heldByPause: 0 },
        attempts: { total: 0, sent: 0 },
        dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' },
      });
    }
  });

  it('isolates tenants (404) and validates ids and queries', async () => {
    role = 'OWNER';
    const foreign = fx.tenantB.organizationId;
    expect((await call('GET', `/v1/campaigns/${campaignId}/report`, foreign)).status).toBe(404);
    expect((await call('GET', `/v1/campaigns/${campaignId}/attempts`, foreign)).status).toBe(404);
    const org = fx.tenantA.organizationId;
    expect((await call('GET', '/v1/campaigns/not-a-uuid/report', org)).status).toBe(400);
    expect(
      (await call('GET', `/v1/campaigns/${campaignId}/attempts?outcome=WON`, org)).status,
    ).toBe(400);
    expect((await call('GET', `/v1/campaigns/${campaignId}/attempts?limit=101`, org)).status).toBe(
      400,
    );
    const attempts = await call('GET', `/v1/campaigns/${campaignId}/attempts?limit=10`, org);
    expect([attempts.status, attempts.json]).toEqual([200, []]);
  });
});
