import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantRole } from '@voice-agent/contracts';
import {
  DrizzleContactRepository,
  DrizzleContactSuppressionRepository,
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

const tdb = await createDisposableTestDatabase('contacts-api');

/** 008-MVP1 — API de contatos/supressão: HTTP real + repositórios reais + PostgreSQL. */
describe('008-MVP1 contacts API (HTTP + PostgreSQL)', () => {
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

  const csv = 'Nome,Telefone\nAna,(11) 98765-4321\n=CMD(),11 9123\nAna de novo,+5511987654321';

  it('imports a CSV with a rejection report that is safe against formula injection', async () => {
    role = 'MANAGER';
    const list = await call('POST', '/v1/contact-lists', fx.tenantA.organizationId, {
      name: 'Leads',
    });
    expect(list.status).toBe(201);
    const report = await call(
      'POST',
      `/v1/contact-lists/${list.json.id}/imports`,
      fx.tenantA.organizationId,
      {
        csv,
        mapping: { phoneColumn: 'Telefone', nameColumn: 'Nome' },
      },
    );
    expect(report.status).toBe(200);
    expect(report.json).toMatchObject({
      created: 1,
      existing: 0,
      addedToList: 1,
      rejected: [
        { rowNumber: 2, reason: 'UNSUPPORTED_FORMAT' },
        { rowNumber: 3, reason: 'DUPLICATE_IN_FILE' },
      ],
    });
    expect(String(report.json.rejectedRowsCsv)).not.toMatch(/(^|,)"=/m);
  });

  it('enforces RBAC: viewers read, operators suppress, neither imports', async () => {
    role = 'MANAGER';
    const list = await call('POST', '/v1/contact-lists', fx.tenantA.organizationId, {
      name: 'RBAC',
    });
    role = 'VIEWER';
    expect((await call('GET', '/v1/contact-lists', fx.tenantA.organizationId)).status).toBe(200);
    expect(
      (
        await call('POST', '/v1/contact-suppressions', fx.tenantA.organizationId, {
          phone: '11 98888-0000',
          reason: 'OPT_OUT',
        })
      ).status,
    ).toBe(403);
    role = 'OPERATOR';
    const imported = await call(
      'POST',
      `/v1/contact-lists/${list.json.id}/imports`,
      fx.tenantA.organizationId,
      {
        csv,
        mapping: { phoneColumn: 'Telefone' },
      },
    );
    expect(imported.status).toBe(403);
    const suppressed = await call('POST', '/v1/contact-suppressions', fx.tenantA.organizationId, {
      phone: '(11) 98888-0000',
      reason: 'OPT_OUT',
      evidenceReference: 'ticket-42',
    });
    expect(suppressed.status).toBe(201);
    expect(suppressed.json).toMatchObject({
      status: 'SUPPRESSED',
      suppression: { phoneE164: '+5511988880000' },
    });
    const again = await call('POST', '/v1/contact-suppressions', fx.tenantA.organizationId, {
      phone: '+5511988880000',
      reason: 'MANUAL',
    });
    expect(again).toMatchObject({
      status: 200,
      json: { status: 'ALREADY_SUPPRESSED', suppression: { reason: 'OPT_OUT' } },
    });
  });

  it('isolates tenants: another tenant gets 404 on the list and sees none of its data', async () => {
    role = 'OWNER';
    const list = await call('POST', '/v1/contact-lists', fx.tenantA.organizationId, {
      name: 'Privada',
    });
    await call('POST', `/v1/contact-lists/${list.json.id}/imports`, fx.tenantA.organizationId, {
      csv: 'Telefone\n11 97654-3210',
      mapping: { phoneColumn: 'Telefone' },
    });
    const foreignImport = await call(
      'POST',
      `/v1/contact-lists/${list.json.id}/imports`,
      fx.tenantB.organizationId,
      {
        csv: 'Telefone\n11 97654-3211',
        mapping: { phoneColumn: 'Telefone' },
      },
    );
    expect(foreignImport.status).toBe(404);
    const foreignMembers = await call(
      'GET',
      `/v1/contact-lists/${list.json.id}/members?eligibility=ALL`,
      fx.tenantB.organizationId,
    );
    expect(foreignMembers).toEqual({ status: 200, json: [] });
    expect((await call('GET', '/v1/contact-suppressions', fx.tenantB.organizationId)).json).toEqual(
      [],
    );
  });

  it('lists only eligible members by default (suppressed numbers are excluded)', async () => {
    role = 'OWNER';
    const list = await call('POST', '/v1/contact-lists', fx.tenantA.organizationId, {
      name: 'Elegíveis',
    });
    await call('POST', `/v1/contact-lists/${list.json.id}/imports`, fx.tenantA.organizationId, {
      csv: 'Telefone\n11 96543-2100\n11 96543-2101',
      mapping: { phoneColumn: 'Telefone' },
    });
    await call('POST', '/v1/contact-suppressions', fx.tenantA.organizationId, {
      phone: '11 96543-2100',
      reason: 'DO_NOT_CALL_REGISTRY',
    });
    const members = await call(
      'GET',
      `/v1/contact-lists/${list.json.id}/members`,
      fx.tenantA.organizationId,
    );
    expect((members.json as Array<{ phoneE164: string }>).map((m) => m.phoneE164)).toEqual([
      '+5511965432101',
    ]);
  });

  it('refuses oversized import bodies before parsing them (413)', async () => {
    role = 'OWNER';
    const list = await call('POST', '/v1/contact-lists', fx.tenantA.organizationId, {
      name: 'Gigante',
    });
    const huge = 'Telefone\n' + '"'.repeat(5 * 1024 * 1024);
    const response = await call(
      'POST',
      `/v1/contact-lists/${list.json.id}/imports`,
      fx.tenantA.organizationId,
      {
        csv: huge,
        mapping: { phoneColumn: 'Telefone' },
      },
    );
    expect(response.status).toBe(413);
  });

  it('rejects invalid CSVs and phones with 400 without partial writes', async () => {
    role = 'OWNER';
    const list = await call('POST', '/v1/contact-lists', fx.tenantA.organizationId, {
      name: 'Inválida',
    });
    const bad = await call(
      'POST',
      `/v1/contact-lists/${list.json.id}/imports`,
      fx.tenantA.organizationId,
      {
        csv: 'Nome\nAna',
        mapping: { phoneColumn: 'Telefone' },
      },
    );
    expect(bad.status).toBe(400);
    expect(
      (
        await call('POST', '/v1/contact-suppressions', fx.tenantA.organizationId, {
          phone: '0800 123 4567',
          reason: 'MANUAL',
        })
      ).status,
    ).toBe(400);
    const members = await call(
      'GET',
      `/v1/contact-lists/${list.json.id}/members?eligibility=ALL`,
      fx.tenantA.organizationId,
    );
    expect(members.json).toEqual([]);
  });
});
