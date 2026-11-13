import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  agentConfigurationSnapshotV1Schema,
  type KnowledgeRetrievalPort,
} from '@voice-agent/contracts';
import {
  AgentRepository,
  AgentVersionRepository,
  DrizzleKnowledgeRetrievalService,
} from '@voice-agent/database';
import {
  createDisposableTestDatabase,
  createKnowledgeSimulationFixture,
  knowledgeSimulationConfig,
  type DisposableTestDatabase,
  type KnowledgeSimulationFixture,
} from '@voice-agent/database/test-support';
import { CallLifecycleGateway } from './call-lifecycle-gateway.js';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import { InMemoryToolRegistry } from './tool-registry.js';
import { createKnowledgeSearchToolDefinition } from './knowledge-search-tool.js';
import { runSimulatedKnowledgeTurn } from './knowledge-simulated-turn.js';

/** Bancos preexistentes que esta suíte nunca pode usar como destino. */
const FORBIDDEN_TARGETS = ['voice_agent_ui_0561f39', 'voice_agent_pr157_test', 'voice_agent_dev'];

describe('KB-SIM-1: simulated turn with a published agent (disposable PostgreSQL)', () => {
  let tdb: DisposableTestDatabase;
  let ids: KnowledgeSimulationFixture;
  let searches = 0;

  /**
   * Composição offline de teste: lê agente ATIVO + versão PUBLICADA do banco e
   * emite a concessão pelo gateway em memória (sem chamada, tentativa ou
   * provedor). Devolve `null` quando o agente não pode atender.
   */
  async function grantFor(organizationId: string, agentId: string) {
    const agent = await new AgentRepository(tdb.db).getAgentById({ organizationId, agentId });
    if (!agent || agent.status !== 'ACTIVE') return null;
    const version = await new AgentVersionRepository(tdb.db).getCurrentPublishedVersion({
      organizationId,
      agentId,
    });
    if (!version) return null;
    const gateway = new CallLifecycleGateway({
      bootstrapRegistry: new InMemoryCallBootstrapRegistry(),
      sessionStore: new InMemoryCallSessionStore(),
    });
    const bootstrap = await gateway.prepareCall({
      organizationId,
      agentId,
      agentVersionId: version.id,
      agentSnapshot: agentConfigurationSnapshotV1Schema.parse(version.configuration),
      agentVersionStatus: version.status,
    });
    return (await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId)).toolGrant;
  }

  async function ask(organizationId: string, agentId: string, utterance: string) {
    const grant = await grantFor(organizationId, agentId);
    if (!grant) throw new Error('agent cannot serve a simulated turn');
    const real = new DrizzleKnowledgeRetrievalService(tdb.db);
    const counting: KnowledgeRetrievalPort = {
      retrieve: (request) => {
        searches += 1;
        return real.retrieve(request);
      },
    };
    const registry = new InMemoryToolRegistry();
    registry.registerTool(createKnowledgeSearchToolDefinition({ retrievalPort: counting }));
    return runSimulatedKnowledgeTurn({ grant, registry, utterance });
  }

  beforeAll(async () => {
    tdb = await createDisposableTestDatabase('knowledge-simulated-turn');
    ids = await createKnowledgeSimulationFixture(tdb.db, Math.random().toString(36).slice(2, 8));
  }, 180_000);

  afterAll(async () => {
    await tdb?.drop();
  }, 60_000);

  it('runs only on a database created by this suite (of2_test_*), never a preexisting one', async () => {
    expect(tdb.name).toMatch(/^of2_test_[0-9a-f]{12}$/);
    expect(FORBIDDEN_TARGETS).not.toContain(tdb.name);
    const current = await tdb.db.execute('SELECT current_database() AS name');
    expect((current.rows[0] as { name: string }).name).toBe(tdb.name);
  });

  it('1. transmitters: answered from the catalog with direct evidence first', async () => {
    const turn = await ask(
      ids.orgA,
      ids.sales,
      'Quais transmissores de pressão a Qualitec oferece?',
    );
    expect(turn.outcome).toBe('ANSWERED_WITH_EVIDENCE');
    expect(turn.replyText).toContain('QT-310');
    expect(turn.replyText).toContain('QT-520');
    expect(turn.evidence.slice(0, 2).every((e) => e.relevance === 'DIRECT')).toBe(true);
    expect(turn.unmatchedTerms).toEqual([]);
  });

  it('2. helicopter: no evidence, no excerpt, no catalog product, no price FAQ', async () => {
    const turn = await ask(ids.orgA, ids.sales, 'preço do helicóptero');
    expect(turn).toEqual({
      outcome: 'NO_EVIDENCE',
      replyText:
        'Não encontrei menção a helicoptero nos documentos da empresa; não posso confirmar que a empresa ofereça isso.',
      evidence: [],
      unmatchedTerms: ['helicoptero'],
    });
  });

  it('3. price of a real product: product DIRECT first, price FAQ as general information', async () => {
    const turn = await ask(ids.orgA, ids.sales, 'Qual o preço do transmissor QT-310?');
    expect(turn.evidence[0]).toMatchObject({ relevance: 'DIRECT' });
    expect(turn.evidence[0]!.excerpt).toContain('QT-310');
    const faq = turn.evidence.find((e) => e.excerpt.includes('orçamento'));
    expect(faq?.relevance).toBe('CONTEXT');
    const lines = turn.replyText.split('\n');
    expect(lines.findIndex((l) => l.includes('orçamento'))).toBeGreaterThan(
      lines.findIndex((l) => l.startsWith('Informação geral')),
    );
  });

  it('4. published version without knowledge.search: not enabled, no search executed', async () => {
    const before = searches;
    const turn = await ask(ids.orgA, ids.noTool, 'Quais transmissores de pressão?');
    expect(turn).toMatchObject({ outcome: 'TOOL_NOT_ENABLED', evidence: [] });
    expect(searches).toBe(before);
  });

  it('5. draft-only and archived agents cannot serve; the gateway refuses non-published versions', async () => {
    expect(await grantFor(ids.orgA, ids.draftOnly)).toBeNull();
    expect(await grantFor(ids.orgA, ids.archived)).toBeNull();
    const gateway = new CallLifecycleGateway({
      bootstrapRegistry: new InMemoryCallBootstrapRegistry(),
      sessionStore: new InMemoryCallSessionStore(),
    });
    await expect(
      gateway.prepareCall({
        organizationId: ids.orgA,
        agentId: ids.draftOnly,
        agentVersionId: '44444444-4444-4444-8444-444444444444',
        agentSnapshot: knowledgeSimulationConfig(['knowledge.search']),
        agentVersionStatus: 'DRAFT',
      }),
    ).rejects.toThrow();
  });

  it('6. tenant isolation: organization B sells helicopters, never used for A', async () => {
    const own = await ask(ids.orgA, ids.sales, 'helicóptero H-125');
    expect(own.outcome).toBe('NO_EVIDENCE');
    const other = await ask(ids.orgB, ids.salesB, 'preço do helicóptero');
    expect(other.outcome).toBe('ANSWERED_WITH_EVIDENCE');
    expect(other.replyText).toContain('Helicóptero H-125');
    expect(await grantFor(ids.orgB, ids.sales)).toBeNull();
  });

  it('7. document pinned to another agent is not used by the sales agent', async () => {
    const sales = await ask(ids.orgA, ids.sales, 'bomba centrífuga');
    expect(sales.outcome).toBe('NO_EVIDENCE');
    expect(sales.replyText).not.toContain('BC-90');
    const support = await ask(ids.orgA, ids.support, 'bomba centrífuga');
    expect(support.replyText).toContain('BC-90');
  });
});
