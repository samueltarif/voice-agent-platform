import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeSimulatedTurnResponse, TenantRole } from '@voice-agent/contracts';
import type { MembershipRepository, OrganizationRepository } from '@voice-agent/database';
import {
  createDisposableTestDatabase,
  createKnowledgeSimulationFixture,
  type KnowledgeSimulationFixture,
} from '@voice-agent/database/test-support';
import { createNullLogger } from '@voice-agent/logger';
import { createApp } from '../app.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { createKnowledgeSimulatedTurnService } from '../simulation/knowledge-simulated-turn-service.js';

const tdb = await createDisposableTestDatabase('knowledge-simulated-turn-api');

/**
 * DEC-061 — conversa simulada do Agent Studio via HTTP real + serviço real +
 * PostgreSQL descartável. Sem IA, chamada, campanha, worker ou provedor.
 */
describe('POST /v1/knowledge/simulated-turn (HTTP + PostgreSQL)', () => {
  const kid = 'kb-sim-key';
  const sub = 'user-kb-sim';
  let privateJwk: JWK;
  let app: ReturnType<typeof createApp>;
  let fx: KnowledgeSimulationFixture;
  let role: TenantRole = 'OWNER';
  const fetchSpy = vi.fn(async () => {
    throw new Error('network is not allowed in the simulator');
  });
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    fx = await createKnowledgeSimulationFixture(tdb.db, Math.random().toString(36).slice(2, 8));
    const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = { ...(await exportJWK(keys.privateKey)), kid };
    const publicJwk = { ...(await exportJWK(keys.publicKey)), kid };
    const active = new Set([fx.orgA, fx.orgB]);
    app = createApp({
      logger: createNullLogger(),
      verifier: new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      organizationRepo: {
        findOrganizationById: async ({ id }: { id: string }) =>
          active.has(id) ? { id, status: 'ACTIVE' } : null,
      } as unknown as OrganizationRepository,
      membershipRepo: {
        findMembership: async (q: { organizationId: string; userId: string }) =>
          active.has(q.organizationId) && q.userId === sub
            ? { ...q, role, status: 'ACTIVE' }
            : null,
      } as unknown as MembershipRepository,
      knowledgeSimulatedTurn: createKnowledgeSimulatedTurnService(tdb.db),
    } as unknown as ApiDependencies);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  }, 180_000);

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await tdb.drop();
  }, 60_000);

  beforeEach(() => {
    role = 'OWNER';
  });

  async function post(body: unknown, orgId = fx.orgA) {
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
    return app.request('/v1/knowledge/simulated-turn', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function ask(utterance: string, agentId = fx.sales, orgId = fx.orgA) {
    const res = await post({ agentId, utterance }, orgId);
    expect(res.status).toBe(200);
    return (await res.json()) as KnowledgeSimulatedTurnResponse;
  }

  async function errorCode(res: Response) {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  it('1. transmitters: grounded reply, with the published agent and version identified', async () => {
    const { agent, turn } = await ask('Quais transmissores de pressão a Qualitec oferece?');
    expect(agent).toMatchObject({ agentId: fx.sales, versionNumber: 1 });
    expect(turn.outcome).toBe('ANSWERED_WITH_EVIDENCE');
    expect(turn.replyText).toContain('QT-310');
    expect(turn.replyText).toContain('QT-520');
    expect(turn.evidence.slice(0, 2).every((e) => e.relevance === 'DIRECT')).toBe(true);
  });

  it('2. helicopter price: no evidence and no invented claim', async () => {
    const { turn } = await ask('preço do helicóptero');
    expect(turn).toEqual({
      outcome: 'NO_EVIDENCE',
      replyText:
        'Não encontrei menção a helicoptero nos documentos da empresa; não posso confirmar que a empresa ofereça isso.',
      evidence: [],
      unmatchedTerms: ['helicoptero'],
    });
  });

  it('3. commercial question about a real product: DIRECT before CONTEXT', async () => {
    const { turn } = await ask('Qual o preço do transmissor QT-310?');
    expect(turn.evidence[0]).toMatchObject({ relevance: 'DIRECT' });
    const firstContext = turn.evidence.findIndex((e) => e.relevance === 'CONTEXT');
    expect(firstContext).toBeGreaterThan(0);
    expect(turn.evidence.slice(firstContext).every((e) => e.relevance === 'CONTEXT')).toBe(true);
  });

  it('4. agent without knowledge.search: blocked as not enabled', async () => {
    const { turn } = await ask('Quais transmissores de pressão?', fx.noTool);
    expect(turn).toMatchObject({ outcome: 'TOOL_NOT_ENABLED', evidence: [] });
  });

  it('5a. roles without permission and members of other organizations are refused', async () => {
    for (const r of ['OPERATOR', 'VIEWER'] as const) {
      role = r;
      expect((await post({ agentId: fx.sales, utterance: 'transmissor' })).status).toBe(403);
    }
    role = 'OWNER';
    const stranger = await post(
      { agentId: fx.sales, utterance: 'x' },
      '99999999-9999-4999-8999-999999999999',
    );
    expect(stranger.status).toBe(403);
  });

  it('5b. another organization, draft-only or archived agents get the same refusal', async () => {
    const crossTenant = await post({ agentId: fx.sales, utterance: 'transmissor' }, fx.orgB);
    expect(crossTenant.status).toBe(409);
    expect(await errorCode(crossTenant)).toBe('KNOWLEDGE_AGENT_UNAVAILABLE');
    const archived = await post({ agentId: fx.archived, utterance: 'transmissor' });
    expect(await errorCode(archived)).toBe('KNOWLEDGE_AGENT_UNAVAILABLE');
    const draft = await post({ agentId: fx.draftOnly, utterance: 'transmissor' });
    expect(draft.status).toBe(409);
    expect(await errorCode(draft)).toBe('KNOWLEDGE_AGENT_NOT_PUBLISHED');
  });

  it('5c. the client cannot supply organization, version, grant or an oversized question', async () => {
    for (const extra of [
      { organizationId: fx.orgB },
      { agentVersionId: fx.sales },
      { grant: { tools: ['knowledge.search'] } },
      { snapshot: { tools: ['knowledge.search'] } },
    ]) {
      expect((await post({ agentId: fx.noTool, utterance: 'transmissor', ...extra })).status).toBe(
        400,
      );
    }
    expect((await post({ agentId: fx.sales, utterance: 'x'.repeat(301) })).status).toBe(400);
    expect((await post({ agentId: fx.sales, utterance: '   ' })).status).toBe(400);
    expect((await post({ agentId: 'not-a-uuid', utterance: 'x' })).status).toBe(400);
  });

  it('isolation: organization B answers about helicopters only for its own agent', async () => {
    const own = await ask('helicóptero H-125');
    expect(own.turn.outcome).toBe('NO_EVIDENCE');
    const other = await ask('preço do helicóptero', fx.salesB, fx.orgB);
    expect(other.turn.replyText).toContain('Helicóptero H-125');
  });

  it('7. no network access: the simulated turns never called fetch', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
