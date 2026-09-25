import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { internalBootstrapSigner } from '../auth/internal-bootstrap-signer.js';
import { internalServiceSigner } from '../auth/internal-service-signer.js';
import { BootstrapApiClient } from './bootstrap-api-client.js';
import { createDatabaseConnection } from '@voice-agent/database';
import type { OrganizationContextResponse } from '@voice-agent/contracts';

const isStaging =
  process.env.APP_ENV === 'staging' &&
  process.env.STAGING_SMOKE_TESTS === 'true' &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.INTERNAL_SERVICE_PRIVATE_JWK) &&
  Boolean(process.env.INTERNAL_SERVICE_PUBLIC_JWKS);

const describeStaging = isStaging ? describe : describe.skip;

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to obtain ephemeral port')));
        return;
      }
      const port = address.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

describeStaging(
  'Neon Staging Tenant Context Bootstrap Auth (Real Process + TCP)',
  { timeout: 90000 },
  () => {
    let pool: ReturnType<typeof createDatabaseConnection>['pool'];
    let apiProcess: ChildProcess;
    let baseUrl: string;
    let port: number;

    let privateJwk: JWK;
    let kid: string;
    let bootstrapClient: BootstrapApiClient;

    const runId = randomUUID().slice(0, 8);
    const userAId = `smoke-boot-u-a-${runId}`;
    const userBId = `smoke-boot-u-b-${runId}`;
    const userCId = `smoke-boot-u-c-${runId}`;

    let orgAId: string;
    let orgBId: string;
    let orgCId: string;
    let orgDId: string;
    let orgEId: string;

    const orgASlug = `smoke-boot-org-a-${runId}`;
    const orgBSlug = `smoke-boot-org-b-${runId}`;
    const orgCSlug = `smoke-boot-org-c-${runId}`;
    const orgDSlug = `smoke-boot-org-d-${runId}`;
    const orgESlug = `smoke-boot-org-e-${runId}`;

    const createdOrgIds: string[] = [];
    const createdUserIds: string[] = [userAId, userBId, userCId];
    let childEnvCaptured: NodeJS.ProcessEnv;

    beforeAll(async () => {
      // 1. Parse staging keys
      privateJwk = JSON.parse(process.env.INTERNAL_SERVICE_PRIVATE_JWK!) as JWK;
      kid = privateJwk.kid!;
      const publicJwksJson = process.env.INTERNAL_SERVICE_PUBLIC_JWKS!;

      // 2. Prepare database connection directly to Neon staging
      const client = createDatabaseConnection({ maxConnections: 3 });
      pool = client.pool;

      // 3. Obtain ephemeral TCP port
      port = await getAvailablePort();
      baseUrl = `http://127.0.0.1:${port}`;

      // Initialize client
      bootstrapClient = new BootstrapApiClient({
        baseUrl,
        privateJwk,
        kid,
        timeoutMs: 15000,
      });

      // 4. Process Separation: Allowlist environment strictly omitting INTERNAL_SERVICE_PRIVATE_JWK
      const childEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        APP_ENV: 'staging',
        STAGING_SMOKE_TESTS: 'true',
        DATABASE_URL: process.env.DATABASE_URL,
        INTERNAL_SERVICE_PUBLIC_JWKS: publicJwksJson,
        PORT: String(port),
        NODE_ENV: 'production',
      };

      childEnvCaptured = childEnv;
      expect(childEnv.INTERNAL_SERVICE_PRIVATE_JWK).toBeUndefined();

      // 5. Spawn compiled apps/api over real TCP
      const apiCwd = path.resolve(process.cwd(), 'apps', 'api');
      apiProcess = spawn(
        'node',
        ['--import', './register-dist.js', 'dist/apps/api/src/server.js'],
        {
          cwd: apiCwd,
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      // 6. Wait for /healthz readiness
      let ready = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const res = await fetch(`${baseUrl}/healthz`);
          if (res.status === 200) {
            ready = true;
            break;
          }
        } catch {
          // Poll retry until server becomes ready
        }
      }

      if (!ready) {
        if (apiProcess.pid) apiProcess.kill('SIGKILL');
        throw new Error(`Compiled apps/api failed to become ready on port ${port}`);
      }

      // 7. Seed base fixtures in Neon staging
      await pool.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, true, now(), now()),
                ($4, $5, $6, true, now(), now()),
                ($7, $8, $9, true, now(), now())`,
        [
          userAId,
          'Smoke Bootstrap User A',
          `${userAId}@example.com`,
          userBId,
          'Smoke Bootstrap User B',
          `${userBId}@example.com`,
          userCId,
          'Smoke Bootstrap User C',
          `${userCId}@example.com`,
        ],
      );

      // Create organizations:
      // Org A (ACTIVE), Org B (ACTIVE), Org C (ACTIVE), Org D (SUSPENDED), Org E (ACTIVE - cross tenant)
      const orgARes = await pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [`Smoke Boot Org A ${runId}`, orgASlug],
      );
      const orgBRes = await pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [`Smoke Boot Org B ${runId}`, orgBSlug],
      );
      const orgCRes = await pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [`Smoke Boot Org C ${runId}`, orgCSlug],
      );
      const orgDRes = await pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'SUSPENDED') RETURNING id`,
        [`Smoke Boot Org D ${runId}`, orgDSlug],
      );
      const orgERes = await pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [`Smoke Boot Org E ${runId}`, orgESlug],
      );

      orgAId = orgARes.rows[0].id;
      orgBId = orgBRes.rows[0].id;
      orgCId = orgCRes.rows[0].id;
      orgDId = orgDRes.rows[0].id;
      orgEId = orgERes.rows[0].id;

      createdOrgIds.push(orgAId, orgBId, orgCId, orgDId, orgEId);

      // Memberships:
      // User A in Org A: role ADMIN, status ACTIVE
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`,
        [orgAId, userAId],
      );

      // User A in Org B: role OPERATOR, status ACTIVE
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'OPERATOR', 'ACTIVE')`,
        [orgBId, userAId],
      );

      // User A in Org C: role VIEWER, status SUSPENDED (inactive membership in active org)
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'VIEWER', 'SUSPENDED')`,
        [orgCId, userAId],
      );

      // User A in Org D: role VIEWER, status ACTIVE (active membership in suspended org)
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'VIEWER', 'ACTIVE')`,
        [orgDId, userAId],
      );

      // User B in Org E: role ADMIN, status ACTIVE (User A has NO membership in Org E)
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`,
        [orgEId, userBId],
      );
    });

    afterAll(async () => {
      // 1. Terminate API process
      if (apiProcess && apiProcess.pid) {
        apiProcess.kill('SIGKILL');
      }

      // 2. Fail-visible cleanup
      const errors: Error[] = [];
      try {
        if (createdOrgIds.length > 0) {
          await pool.query(
            'DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
            [createdOrgIds],
          );
          await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrgIds]);
        }
      } catch (err) {
        errors.push(err as Error);
      }

      try {
        if (createdUserIds.length > 0) {
          await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [createdUserIds]);
        }
      } catch (err) {
        errors.push(err as Error);
      }

      // 3. Zero-leftover verification
      try {
        if (createdOrgIds.length > 0) {
          const checkMemberships = await pool.query(
            'SELECT count(*) FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
            [createdOrgIds],
          );
          expect(Number(checkMemberships.rows[0].count)).toBe(0);

          const checkOrgs = await pool.query(
            'SELECT count(*) FROM organizations WHERE id = ANY($1::uuid[])',
            [createdOrgIds],
          );
          expect(Number(checkOrgs.rows[0].count)).toBe(0);
        }

        if (createdUserIds.length > 0) {
          const checkUsers = await pool.query(
            'SELECT count(*) FROM "user" WHERE id = ANY($1::text[])',
            [createdUserIds],
          );
          expect(Number(checkUsers.rows[0].count)).toBe(0);
        }
      } catch (err) {
        errors.push(err as Error);
      } finally {
        if (pool) {
          await pool.end();
        }
      }

      if (errors.length > 0) {
        throw new Error(
          `Teardown cleanup failed with ${errors.length} error(s):\n${errors.map((e) => e.message).join('\n')}`,
        );
      }
    });

    it('validates OpenAPI 3.1.0 and health check over real TCP', async () => {
      const healthRes = await fetch(`${baseUrl}/healthz`);
      expect(healthRes.status).toBe(200);

      const openapiRes = await fetch(`${baseUrl}/openapi.json`);
      expect(openapiRes.status).toBe(200);
      const spec = (await openapiRes.json()) as {
        openapi: string;
        components?: { securitySchemes?: Record<string, unknown> };
        paths?: Record<string, unknown>;
      };

      expect(spec.openapi).toBe('3.1.0');
      expect(spec.components?.securitySchemes?.bootstrapAssertion).toBeDefined();
      expect(spec.paths?.['/v1/me/organizations']).toBeDefined();
      expect(spec.paths?.['/v1/me/organizations/{orgSlug}']).toBeDefined();
    });

    it('TEST A — authenticated bootstrap list for User A via real TCP', async () => {
      const requestId = randomUUID();
      const orgs = await bootstrapClient.listOrganizationsForUser(userAId, requestId);

      expect(Array.isArray(orgs)).toBe(true);
      const orgA = orgs.find((o) => o.slug === orgASlug);
      expect(orgA).toBeDefined();
      expect(orgA?.id).toBe(orgAId);
      expect(orgA?.name).toBe(`Smoke Boot Org A ${runId}`);
      expect(orgA?.role).toBe('ADMIN');
    });

    it('TEST B — multiple active organizations returned with strict DTO fields', async () => {
      const orgs = await bootstrapClient.listOrganizationsForUser(userAId);

      expect(orgs.length).toBeGreaterThanOrEqual(2);
      const slugs = orgs.map((o) => o.slug);
      expect(slugs).toContain(orgASlug);
      expect(slugs).toContain(orgBSlug);

      const orgB = orgs.find((o) => o.slug === orgBSlug);
      expect(orgB).toBeDefined();
      expect(orgB?.role).toBe('OPERATOR');

      // Verify strict DTO properties
      for (const org of orgs) {
        const keys = Object.keys(org);
        expect(keys.sort()).toEqual(['id', 'name', 'role', 'slug']);
        expect((org as Record<string, unknown>).plan).toBeUndefined();
        expect((org as Record<string, unknown>).entitlements).toBeUndefined();
        expect((org as Record<string, unknown>).permissions).toBeUndefined();
      }
    });

    it('TEST C — returns 200 [] when user has no active memberships', async () => {
      const orgs = await bootstrapClient.listOrganizationsForUser(userCId);
      expect(orgs).toEqual([]);
    });

    it('TEST D — excludes inactive membership (SUSPENDED) from list and slug lookup', async () => {
      const orgs = await bootstrapClient.listOrganizationsForUser(userAId);
      const slugs = orgs.map((o) => o.slug);
      expect(slugs).not.toContain(orgCSlug);

      await expect(bootstrapClient.getOrganizationBySlug(userAId, orgCSlug)).rejects.toThrow(
        /not found/i,
      );
    });

    it('TEST E — excludes inactive organization (SUSPENDED) from list and slug lookup', async () => {
      const orgs = await bootstrapClient.listOrganizationsForUser(userAId);
      const slugs = orgs.map((o) => o.slug);
      expect(slugs).not.toContain(orgDSlug);

      await expect(bootstrapClient.getOrganizationBySlug(userAId, orgDSlug)).rejects.toThrow(
        /not found/i,
      );
    });

    it('TEST F — anti-enumeration: non-member access returns 404 identical to non-existent slug', async () => {
      const token = await internalBootstrapSigner.signBootstrapAssertion({
        userId: userAId,
        privateJwk,
        kid,
      });

      // 1. Lookup existing Org E where User A has NO membership
      const resNonMember = await fetch(`${baseUrl}/v1/me/organizations/${orgESlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resNonMember.status).toBe(404);
      const bodyNonMember = (await resNonMember.json()) as { error?: { code?: string } };
      expect(bodyNonMember.error?.code).toBe('NOT_FOUND');

      // 2. Lookup completely non-existent slug
      const resNonExistent = await fetch(
        `${baseUrl}/v1/me/organizations/completely-fictitious-slug-${runId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(resNonExistent.status).toBe(404);
      const bodyNonExistent = (await resNonExistent.json()) as { error?: { code?: string } };
      expect(bodyNonExistent.error?.code).toBe('NOT_FOUND');
    });

    it('TEST G — role is revalidated dynamically from DB without re-issuing assertion', async () => {
      // 1. Issue assertion
      const token = await internalBootstrapSigner.signBootstrapAssertion({
        userId: userAId,
        privateJwk,
        kid,
      });

      // Initial check: role is ADMIN
      const resInitial = await fetch(`${baseUrl}/v1/me/organizations/${orgASlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resInitial.status).toBe(200);
      const dataInitial = (await resInitial.json()) as OrganizationContextResponse;
      expect(dataInitial.role).toBe('ADMIN');

      // 2. Update membership role in Neon staging to VIEWER
      await pool.query(
        `UPDATE organization_memberships SET role = 'VIEWER' WHERE organization_id = $1 AND user_id = $2`,
        [orgAId, userAId],
      );

      // 3. Reuse the EXACT SAME token
      const resUpdated = await fetch(`${baseUrl}/v1/me/organizations/${orgASlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resUpdated.status).toBe(200);
      const dataUpdated = (await resUpdated.json()) as OrganizationContextResponse;
      expect(dataUpdated.role).toBe('VIEWER');

      // 4. Restore role to ADMIN for subsequent tests
      await pool.query(
        `UPDATE organization_memberships SET role = 'ADMIN' WHERE organization_id = $1 AND user_id = $2`,
        [orgAId, userAId],
      );
    });

    it('TEST H — membership revocation with still-valid assertion immediately removes access', async () => {
      // 1. Issue assertion
      const token = await internalBootstrapSigner.signBootstrapAssertion({
        userId: userAId,
        privateJwk,
        kid,
      });

      // Verify initial access
      const resBefore = await fetch(`${baseUrl}/v1/me/organizations/${orgASlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resBefore.status).toBe(200);

      // 2. Revoke membership in Neon staging
      await pool.query(
        `UPDATE organization_memberships SET status = 'SUSPENDED' WHERE organization_id = $1 AND user_id = $2`,
        [orgAId, userAId],
      );

      // 3. Reuse the same token: list must exclude Org A and slug lookup must return 404
      const resList = await fetch(`${baseUrl}/v1/me/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resList.status).toBe(200);
      const listData = (await resList.json()) as OrganizationContextResponse[];
      expect(listData.some((o) => o.slug === orgASlug)).toBe(false);

      const resSlug = await fetch(`${baseUrl}/v1/me/organizations/${orgASlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resSlug.status).toBe(404);

      // 4. Restore membership to ACTIVE
      await pool.query(
        `UPDATE organization_memberships SET status = 'ACTIVE' WHERE organization_id = $1 AND user_id = $2`,
        [orgAId, userAId],
      );
    });

    it('TEST I — bootstrap/tenant audience isolation over real TCP', async () => {
      // 1. Bootstrap token (aud: voice-agent:api:bootstrap, scope: user:bootstrap)
      const bootstrapToken = await internalBootstrapSigner.signBootstrapAssertion({
        userId: userAId,
        privateJwk,
        kid,
      });

      // Bootstrap token -> /v1/me/* = 200
      const meRes = await fetch(`${baseUrl}/v1/me/organizations`, {
        headers: { Authorization: `Bearer ${bootstrapToken}` },
      });
      expect(meRes.status).toBe(200);

      // Bootstrap token -> /v1/agents/* = 401
      const agentsResWithBootstrap = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${bootstrapToken}` },
      });
      expect(agentsResWithBootstrap.status).toBe(401);

      // 2. Tenant token (aud: voice-agent:api, orgId present)
      const tenantToken = await internalServiceSigner.createAssertion({
        userId: userAId,
        organizationId: orgAId,
        privateJwk,
        kid,
      });

      // Tenant token -> /v1/me/* = 401
      const meResWithTenant = await fetch(`${baseUrl}/v1/me/organizations`, {
        headers: { Authorization: `Bearer ${tenantToken}` },
      });
      expect(meResWithTenant.status).toBe(401);

      // Tenant token -> /v1/agents = 200
      const agentsResWithTenant = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${tenantToken}` },
      });
      expect(agentsResWithTenant.status).toBe(200);
    });

    it('TEST J — rejects tampered bootstrap token with 401', async () => {
      const validToken = await internalBootstrapSigner.signBootstrapAssertion({
        userId: userAId,
        privateJwk,
        kid,
      });

      // Tamper signature by changing the last character
      const tampered = validToken.slice(0, -2) + (validToken.endsWith('A') ? 'B' : 'A') + '=';

      const res = await fetch(`${baseUrl}/v1/me/organizations`, {
        headers: { Authorization: `Bearer ${tampered}` },
      });
      expect(res.status).toBe(401);
    });

    it('TEST K — rejects bootstrap token with prohibited claims (orgId) with 401', async () => {
      // Craft valid Ed25519 token with prohibited claim orgId
      const { importJWK } = await import('jose');
      const privKey = await importJWK(privateJwk, 'EdDSA');
      const now = Math.floor(Date.now() / 1000);

      const illegalToken = await new SignJWT({
        sub: userAId,
        scope: 'user:bootstrap',
        iss: 'voice-agent:web',
        aud: 'voice-agent:api:bootstrap',
        iat: now,
        exp: now + 30,
        jti: randomUUID(),
        orgId: orgAId, // PROHIBITED
      })
        .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
        .sign(privKey);

      const res = await fetch(`${baseUrl}/v1/me/organizations`, {
        headers: { Authorization: `Bearer ${illegalToken}` },
      });
      expect(res.status).toBe(401);
    });

    it('TEST L — public JWKS boundary: verifies API process lacks private JWK while verifier functions', async () => {
      expect(childEnvCaptured.INTERNAL_SERVICE_PRIVATE_JWK).toBeUndefined();
      expect(childEnvCaptured.INTERNAL_SERVICE_PUBLIC_JWKS).toBeDefined();

      const token = await internalBootstrapSigner.signBootstrapAssertion({
        userId: userAId,
        privateJwk,
        kid,
      });

      const res = await fetch(`${baseUrl}/v1/me/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
    });

    it('TEST M — rejects token signed with unknown kid with 401', async () => {
      const { privateKey: unknownPrivKey } = await generateKeyPair('EdDSA', {
        crv: 'Ed25519',
        extractable: true,
      });
      const unknownPrivJwk = await exportJWK(unknownPrivKey);
      unknownPrivJwk.kid = `unknown-key-${runId}`;

      const unknownKidToken = await internalBootstrapSigner.signBootstrapAssertion({
        userId: userAId,
        privateJwk: unknownPrivJwk,
        kid: unknownPrivJwk.kid!,
      });

      const res = await fetch(`${baseUrl}/v1/me/organizations`, {
        headers: { Authorization: `Bearer ${unknownKidToken}` },
      });
      expect(res.status).toBe(401);
    });
  },
);
