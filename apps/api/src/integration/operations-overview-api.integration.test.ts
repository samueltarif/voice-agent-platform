import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantRole } from '@voice-agent/contracts';
import {
  DrizzleCampaignLifecycleRepository,
  DrizzleCampaignReportRepository,
  DrizzleOperationsOverviewRepository,
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

const tdb = await createDisposableTestDatabase('operations-overview-api');

/** 008-MVP4c — visão operacional via HTTP real + repositórios reais + PostgreSQL. */
describe('008-MVP4c operations overview API (HTTP + PostgreSQL)', () => {
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
      operationsOverviewRepo: new DrizzleOperationsOverviewRepository(tdb.db),
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

  it('returns the overview of the caller organization with costs only for authorized roles', async () => {
    const org = fx.tenantA.organizationId;
    for (const [r, costsVisible] of [
      ['OWNER', true],
      ['MANAGER', true],
      ['OPERATOR', false],
      ['VIEWER', false],
    ] as const) {
      role = r;
      const res = await call('GET', '/v1/operations/overview?days=30', org);
      expect([r, res.status, res.json.costs !== null]).toEqual([r, 200, costsVisible]);
      expect(res.json).toMatchObject({
        periodDays: 30,
        liveSessions: 0,
        handoffs: { available: false, reason: 'NOT_PERSISTED' },
        dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' },
      });
    }
  });

  it('validates the period, pagination and outcome filters', async () => {
    role = 'OWNER';
    const org = fx.tenantA.organizationId;
    expect((await call('GET', '/v1/operations/overview?days=0', org)).status).toBe(400);
    expect((await call('GET', '/v1/operations/overview?days=91', org)).status).toBe(400);
    expect((await call('GET', '/v1/operations/overview?organizationId=x', org)).status).toBe(400);
    expect((await call('GET', '/v1/operations/attempts?limit=101', org)).status).toBe(400);
    expect((await call('GET', '/v1/operations/attempts?outcome=WON', org)).status).toBe(400);
    expect(await call('GET', '/v1/operations/attempts?limit=10', org)).toEqual({
      status: 200,
      json: [],
    });
  });

  it('scopes everything to the organization of the assertion', async () => {
    role = 'OWNER';
    const a = await call('GET', '/v1/operations/overview', fx.tenantA.organizationId);
    const b = await call('GET', '/v1/operations/overview', fx.tenantB.organizationId);
    const ids = (r: typeof a) =>
      (r.json.campaigns as { running: { campaignId: string }[] }).running.map((c) => c.campaignId);
    expect(ids(a)).toEqual([fx.tenantA.campaignId]);
    expect(ids(b)).toEqual([fx.tenantB.campaignId]);
  });

  it('requires the internal service assertion', async () => {
    for (const path of ['/v1/operations/overview', '/v1/operations/attempts']) {
      expect((await app.request(path)).status).toBe(401);
    }
  });
});
