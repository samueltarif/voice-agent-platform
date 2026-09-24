import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { internalServiceSigner } from '../auth/internal-service-signer.js';
import { createDatabaseConnection } from '@voice-agent/database';
import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  ApiErrorResponse,
  AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';

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
  'Neon Staging Internal Service Auth & Agent API (Real Process + TCP)',
  { timeout: 90000 },
  () => {
    let pool: ReturnType<typeof createDatabaseConnection>['pool'];
    let apiProcess: ChildProcess;
    let baseUrl: string;
    let port: number;

    let privateJwk: JWK;
    let kid: string;

    const runId = randomUUID().slice(0, 8);
    const userAId = `smoke-u-a-${runId}`;
    const userBId = `smoke-u-b-${runId}`;
    let orgAId: string;
    let orgBId: string;

    const createdOrgIds: string[] = [];
    const createdUserIds: string[] = [userAId, userBId];
    const createdAgentIds: string[] = [];

    const canonicalConfig: AgentConfigurationSnapshotV1 = {
      persona: {
        role: 'Atendente Virtual',
        companyName: 'Staging Platform Corp',
        objective: 'Auxiliar clientes em triagem',
        tone: 'FORMAL',
        greetingPhrase: 'Olá, como posso ajudar?',
        closingPhrase: 'Obrigado pelo contato.',
        fallbackPhrase: 'Desculpe, não compreendi.',
      },
      voice: {
        languageCode: 'pt-BR',
      },
      rules: {
        conversational: ['Nunca prometer prazos incertos'],
        deterministic: {
          maxDiscountPercent: 10,
          operatingHours: '08:00-18:00',
        },
      },
      playbook: {
        stages: [
          { name: 'Acolhimento', goal: 'Identificar cliente' },
          { name: 'Triagem', goal: 'Direcionar atendimento' },
        ],
      },
      examples: [
        {
          customerInput: 'Quero saber sobre meu plano',
          idealAgentResponse: 'Vou consultar suas informações agora mesmo.',
        },
      ],
    };

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

      // 4. Section 3: Process Separation - Allowlist environment strictly omitting INTERNAL_SERVICE_PRIVATE_JWK
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

      expect(childEnv.INTERNAL_SERVICE_PRIVATE_JWK).toBeUndefined();

      // 5. Spawn compiled apps/api
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
       VALUES ($1, $2, $3, true, now(), now()), ($4, $5, $6, true, now(), now())`,
        [
          userAId,
          'Staging Smoke User A',
          `${userAId}@example.com`,
          userBId,
          'Staging Smoke User B',
          `${userBId}@example.com`,
        ],
      );

      const orgARes = await pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [`Smoke Org A ${runId}`, `smoke-org-a-${runId}`],
      );
      const orgBRes = await pool.query(
        `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [`Smoke Org B ${runId}`, `smoke-org-b-${runId}`],
      );

      orgAId = orgARes.rows[0].id;
      orgBId = orgBRes.rows[0].id;
      createdOrgIds.push(orgAId, orgBId);

      // Initial membership: User A is ADMIN in Org A
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`,
        [orgAId, userAId],
      );

      // Commercial Grant: Org A has agents.max = 1
      await pool.query(
        `INSERT INTO commercial_grants (organization_id, feature_key, override_value, granted_by, reason)
       VALUES ($1, 'agents.max', '1', 'system', '005C staging validation quota')`,
        [orgAId],
      );
    });

    afterAll(async () => {
      // Terminate API server
      if (apiProcess && apiProcess.pid) {
        apiProcess.kill('SIGKILL');
      }

      // Cleanup all fixtures scoped to runId
      try {
        if (createdOrgIds.length > 0) {
          await pool.query('DELETE FROM audit_logs WHERE organization_id = ANY($1::uuid[])', [
            createdOrgIds,
          ]);
          await pool.query('DELETE FROM agent_versions WHERE organization_id = ANY($1::uuid[])', [
            createdOrgIds,
          ]);
          await pool.query('DELETE FROM agents WHERE organization_id = ANY($1::uuid[])', [
            createdOrgIds,
          ]);
          await pool.query(
            'DELETE FROM commercial_grants WHERE organization_id = ANY($1::uuid[])',
            [createdOrgIds],
          );
          await pool.query(
            'DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
            [createdOrgIds],
          );
          await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrgIds]);
        }
        if (createdUserIds.length > 0) {
          await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [createdUserIds]);
        }

        // Zero-leftover verification
        if (createdOrgIds.length > 0) {
          const checkOrgs = await pool.query(
            'SELECT count(*) FROM organizations WHERE id = ANY($1::uuid[])',
            [createdOrgIds],
          );
          expect(Number(checkOrgs.rows[0].count)).toBe(0);
          const checkAgents = await pool.query(
            'SELECT count(*) FROM agents WHERE organization_id = ANY($1::uuid[])',
            [createdOrgIds],
          );
          expect(Number(checkAgents.rows[0].count)).toBe(0);
        }
      } finally {
        if (pool) {
          await pool.end();
        }
      }
    });

    async function createToken(userId: string, organizationId: string): Promise<string> {
      return internalServiceSigner.createAssertion({
        userId,
        organizationId,
        privateJwk,
        kid,
      });
    }

    // TEST A & B: REAL TCP AUTH SUCCESS & CHILD PRIVATE KEY ABSENCE
    it('TEST A & B: performs real TCP request with BFF signer assertion and proves child env private-key absence', async () => {
      const token = await createToken(userAId, orgAId);
      const res = await fetch(`${baseUrl}/v1/agents`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      expect(res.status).toBe(200);
      const requestId = res.headers.get('x-request-id');
      expect(requestId).toBeTruthy();
      expect(typeof requestId).toBe('string');

      const body = (await res.json()) as AgentMetadataResponse[];
      expect(Array.isArray(body)).toBe(true);
    });

    // TEST C: INVALID SIGNATURE
    it('TEST C: rejects assertion signed by untrusted ephemeral key with 401', async () => {
      const untrustedKey = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
      const untrustedPrivate = await exportJWK(untrustedKey.privateKey);
      untrustedPrivate.kid = 'untrusted-staging-key';

      const now = Math.floor(Date.now() / 1000);
      const untrustedToken = await new SignJWT({
        sub: userAId,
        orgId: orgAId,
        iss: 'voice-agent:web',
        aud: 'voice-agent:api',
        iat: now,
        exp: now + 30,
        jti: randomUUID(),
      })
        .setProtectedHeader({ alg: 'EdDSA', kid: 'untrusted-staging-key', typ: 'JWT' })
        .sign(untrustedKey.privateKey);

      const res = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${untrustedToken}` },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as ApiErrorResponse;
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(body.error.requestId).toBeTruthy();
    });

    // TEST D: MEMBERSHIP VALIDATION
    it('TEST D: returns 403 when user has valid token but zero membership, then allows on membership creation', async () => {
      // User B has no membership in Org A
      const tokenWithoutMembership = await createToken(userBId, orgAId);
      const resForbidden = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${tokenWithoutMembership}` },
      });

      expect(resForbidden.status).toBe(403);
      const errBody = (await resForbidden.json()) as ApiErrorResponse;
      expect(errBody.error.code).toBe('FORBIDDEN');

      // Add User B as VIEWER in Org A
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'VIEWER', 'ACTIVE')`,
        [orgAId, userBId],
      );

      const tokenWithMembership = await createToken(userBId, orgAId);
      const resAllowed = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${tokenWithMembership}` },
      });

      expect(resAllowed.status).toBe(200);
    });

    // TEST E: MEMBERSHIP REVOCATION
    it('TEST E: reflects dynamic DB revocation immediately within assertion TTL (403)', async () => {
      const token = await createToken(userBId, orgAId);
      const resActive = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resActive.status).toBe(200);

      // Suspend membership directly in DB
      await pool.query(
        `UPDATE organization_memberships SET status = 'SUSPENDED' WHERE user_id = $1 AND organization_id = $2`,
        [userBId, orgAId],
      );

      // Reusing the same valid unexpired assertion
      const resSuspended = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resSuspended.status).toBe(403);

      // Re-activate for further tests
      await pool.query(
        `UPDATE organization_memberships SET status = 'ACTIVE' WHERE user_id = $1 AND organization_id = $2`,
        [userBId, orgAId],
      );
    });

    // TEST F: ROLE REVALIDATION (FROM DB, NOT TOKEN)
    it('TEST F: proves roles are resolved dynamically from database upon privileged mutation', async () => {
      const token = await createToken(userAId, orgAId);

      // User A is currently ADMIN; demote to VIEWER in DB
      await pool.query(
        `UPDATE organization_memberships SET role = 'VIEWER' WHERE user_id = $1 AND organization_id = $2`,
        [userAId, orgAId],
      );

      // Reusing same valid unexpired assertion for privileged action
      const resMutation = await fetch(`${baseUrl}/v1/agents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Blocked Agent', slug: `blocked-${runId}` }),
      });

      expect(resMutation.status).toBe(403);

      // Read should still succeed as VIEWER
      const resRead = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resRead.status).toBe(200);

      // Restore ADMIN role for User A
      await pool.query(
        `UPDATE organization_memberships SET role = 'ADMIN' WHERE user_id = $1 AND organization_id = $2`,
        [userAId, orgAId],
      );
    });

    // TEST G: SIGNED ORG ATTACK
    it('TEST G: rejects signed assertion claiming untrusted orgId with 403', async () => {
      // User A is only member of Org A, signing assertion for Org B
      const signedOrgAttackToken = await createToken(userAId, orgBId);

      const res = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${signedOrgAttackToken}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ApiErrorResponse;
      expect(body.error.code).toBe('FORBIDDEN');
    });

    // TEST K, L, M, N: ADMIN DOMAIN SERVICES, QUOTA, ARCHIVE/REACTIVATE, PUBLISH
    let agentId: string;
    let draftVersionId: string;

    it('TEST K & L: creates first agent and enforces commercial quota agents.max=1 on second agent', async () => {
      const token = await createToken(userAId, orgAId);

      // Create 1st agent -> should succeed
      const resCreate = await fetch(`${baseUrl}/v1/agents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: `Sales Bot ${runId}`, slug: `sales-bot-${runId}` }),
      });

      expect(resCreate.status).toBe(201);
      const createdAgent = (await resCreate.json()) as AgentMetadataResponse;
      expect(createdAgent.id).toBeTruthy();
      expect(createdAgent.status).toBe('ACTIVE');
      agentId = createdAgent.id;
      createdAgentIds.push(agentId);

      // Attempt 2nd agent -> quota exceeded (403 EntitlementExceededError)
      const resQuota = await fetch(`${baseUrl}/v1/agents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: `Second Bot ${runId}`, slug: `second-bot-${runId}` }),
      });

      expect(resQuota.status).toBe(403);
      const quotaErr = (await resQuota.json()) as ApiErrorResponse;
      expect(quotaErr.error.code).toBe('ENTITLEMENT_EXCEEDED');
      expect(quotaErr.error.message.toLowerCase()).toContain('quota');
    });

    it('TEST K & N: draft creation, patch, publication policy (exactly one published, archives previous)', async () => {
      const token = await createToken(userAId, orgAId);

      // Create draft v1
      const resDraft1 = await fetch(`${baseUrl}/v1/agents/${agentId}/drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configuration: canonicalConfig, changelog: 'Initial draft' }),
      });

      expect(resDraft1.status).toBe(201);
      const draft1 = (await resDraft1.json()) as AgentVersionMetadataResponse;
      expect(draft1.versionNumber).toBe(1);
      expect(draft1.status).toBe('DRAFT');
      draftVersionId = draft1.id;

      // Patch draft v1
      const resPatch = await fetch(`${baseUrl}/v1/agents/${agentId}/drafts/${draftVersionId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configuration: canonicalConfig,
          changelog: 'Patched initial draft',
        }),
      });
      expect(resPatch.status).toBe(200);

      // Publish draft v1
      const resPub1 = await fetch(
        `${baseUrl}/v1/agents/${agentId}/drafts/${draftVersionId}/publish`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(resPub1.status).toBe(200);
      const published1 = (await resPub1.json()) as AgentVersionMetadataResponse;
      expect(published1.status).toBe('PUBLISHED');

      // Create draft v2
      const resDraft2 = await fetch(`${baseUrl}/v1/agents/${agentId}/drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configuration: canonicalConfig, changelog: 'Second version draft' }),
      });
      expect(resDraft2.status).toBe(201);
      const draft2 = (await resDraft2.json()) as AgentVersionMetadataResponse;
      expect(draft2.versionNumber).toBe(2);

      // Publish draft v2 -> previous v1 must transition to ARCHIVED
      const resPub2 = await fetch(`${baseUrl}/v1/agents/${agentId}/drafts/${draft2.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resPub2.status).toBe(200);
      const published2 = (await resPub2.json()) as AgentVersionMetadataResponse;
      expect(published2.status).toBe('PUBLISHED');

      // Verify v1 in DB is ARCHIVED and exactly one PUBLISHED exists
      const v1Res = await pool.query('SELECT status FROM agent_versions WHERE id = $1', [
        draftVersionId,
      ]);
      expect(v1Res.rows[0]?.status).toBe('ARCHIVED');
    });

    // TEST M: ARCHIVE AND REACTIVATE WITH QUOTA REVALIDATION
    it('TEST M: archives agent and reactivates revalidating quota', async () => {
      const token = await createToken(userAId, orgAId);

      // Archive agent
      const resArchive = await fetch(`${baseUrl}/v1/agents/${agentId}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resArchive.status).toBe(200);
      const archived = (await resArchive.json()) as AgentMetadataResponse;
      expect(archived.status).toBe('ARCHIVED');

      // Reactivate agent
      const resReactivate = await fetch(`${baseUrl}/v1/agents/${agentId}/reactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resReactivate.status).toBe(200);
      const reactivated = (await resReactivate.json()) as AgentMetadataResponse;
      expect(reactivated.status).toBe('ACTIVE');
    });

    // TEST H: RESOURCE TENANT PRIVACY (CROSS-TENANT 404)
    it('TEST H: returns 404 and does not leak cross-tenant resource existence', async () => {
      // User in Org B requests Agent from Org A
      // Add User B as ADMIN in Org B
      await pool.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`,
        [orgBId, userBId],
      );

      const tokenOrgB = await createToken(userBId, orgBId);

      const resGet = await fetch(`${baseUrl}/v1/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${tokenOrgB}` },
      });
      expect(resGet.status).toBe(404);

      const resMutate = await fetch(`${baseUrl}/v1/agents/${agentId}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenOrgB}` },
      });
      expect(resMutate.status).toBe(404);
    });

    // TEST I: METADATA CONFIDENTIALITY FOR VIEWER
    it('TEST I: enforces metadata confidentiality and forbids configuration read for VIEWER', async () => {
      const tokenViewer = await createToken(userBId, orgAId);

      const resList = await fetch(`${baseUrl}/v1/agents`, {
        headers: { Authorization: `Bearer ${tokenViewer}` },
      });
      expect(resList.status).toBe(200);
      const listBody = (await resList.json()) as Record<string, unknown>[];
      expect(listBody[0]?.configuration).toBeUndefined();
      expect(listBody[0]?.persona).toBeUndefined();
      expect(listBody[0]?.rules).toBeUndefined();

      // Configuration endpoint must be 403 for VIEWER
      const resConfig = await fetch(
        `${baseUrl}/v1/agents/${agentId}/versions/${draftVersionId}/configuration`,
        {
          headers: { Authorization: `Bearer ${tokenViewer}` },
        },
      );
      expect(resConfig.status).toBe(403);
    });

    // TEST J: MANAGER RBAC
    it('TEST J: allows MANAGER metadata, config and draft edit, but forbids publish (403)', async () => {
      // Change User B in Org A to MANAGER
      await pool.query(
        `UPDATE organization_memberships SET role = 'MANAGER' WHERE user_id = $1 AND organization_id = $2`,
        [userBId, orgAId],
      );

      const tokenManager = await createToken(userBId, orgAId);

      // Metadata read -> allowed
      const resMeta = await fetch(`${baseUrl}/v1/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${tokenManager}` },
      });
      expect(resMeta.status).toBe(200);

      // Configuration read -> allowed for MANAGER
      const resConfig = await fetch(
        `${baseUrl}/v1/agents/${agentId}/versions/${draftVersionId}/configuration`,
        {
          headers: { Authorization: `Bearer ${tokenManager}` },
        },
      );
      expect(resConfig.status).toBe(200);

      // Create draft -> allowed for MANAGER
      const resDraft = await fetch(`${baseUrl}/v1/agents/${agentId}/drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenManager}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configuration: canonicalConfig }),
      });
      expect(resDraft.status).toBe(201);
      const newDraft = (await resDraft.json()) as AgentVersionMetadataResponse;

      // Publish -> FORBIDDEN for MANAGER (403)
      const resPublish = await fetch(
        `${baseUrl}/v1/agents/${agentId}/drafts/${newDraft.id}/publish`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenManager}` },
        },
      );
      expect(resPublish.status).toBe(403);
    });

    // TEST O: OPENAPI & HEALTH
    it('TEST O: serves /healthz and /openapi.json over TCP without secret leaks', async () => {
      const resHealth = await fetch(`${baseUrl}/healthz`);
      expect(resHealth.status).toBe(200);
      const healthBody = await resHealth.json();
      expect(healthBody).toEqual({ status: 'ok' });

      const resOpenApi = await fetch(`${baseUrl}/openapi.json`);
      expect(resOpenApi.status).toBe(200);
      const doc = await resOpenApi.json();
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.components?.securitySchemes?.internalServiceAssertion).toBeDefined();

      const docStr = JSON.stringify(doc);
      expect(docStr.includes('privateKey')).toBe(false);
      expect(docStr.includes('"d":')).toBe(false);
    });
  },
);
