import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDatabaseConnection,
  DrizzleKnowledgeRetrievalService,
  ingestKnowledgeDocument,
  OrganizationRepository,
} from '@voice-agent/database';
import {
  knowledgeSearchToolOutputSchema,
  type AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { InMemoryToolRegistry } from './tool-registry.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';
import { createKnowledgeSearchToolDefinition } from './knowledge-search-tool.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

/** Catálogo fictício no formato do catálogo da homologação (produtos + FAQ comercial). */
const SECTIONS = [
  'Qualitec Instrumentação. A Qualitec oferece soluções completas para óleo e gás em todo o Brasil.',
  'Transmissor de Pressão Manométrica QT-310 da Qualitec. Faixa de 0 a 400 bar, saída 4-20 mA.',
  'Transmissor de Pressão Diferencial QT-520 da Qualitec. Faixa de 0 a 25 bar, medição de vazão.',
  'Válvula Esfera Bipartida VE-200 da Qualitec. Corpo em aço inox 316, classe 300.',
  'Perguntas frequentes sobre preços: os preços da Qualitec são enviados por orçamento.',
  'Prazo de entrega e disponibilidade: itens em estoque saem em 5 dias úteis.',
];

const snapshot: AgentConfigurationSnapshotV1 = {
  persona: {
    role: 'Atendente',
    companyName: 'Qualitec',
    objective: 'Atender',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Tchau',
    fallbackPhrase: 'Repita',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '08:00-18:00' } },
  tools: ['knowledge.search'],
};

/**
 * Ferramenta real + motor com concessão da versão publicada + busca Drizzle
 * contra o Postgres local de teste (DEC-058 integrada à DEC-057). Offline: sem
 * composição de produção, sem chamadas a provedores.
 */
describe('knowledge.search with the real retrieval service (integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const runId = Math.random().toString(36).substring(2, 8);
  const orgIds: string[] = [];

  async function createOrg(label: string) {
    const org = await new OrganizationRepository(db).createOrganization({
      slug: `kbtool-${label}-${runId}`,
      name: label,
      status: 'ACTIVE',
    });
    orgIds.push(org!.id);
    return org!.id;
  }

  async function ingest(organizationId: string, locator: string, rawText: string) {
    await ingestKnowledgeDocument(db, {
      organizationId,
      title: `Catálogo ${runId}`,
      source: { sourceType: 'PRODUCT_MANUAL', locator: `${runId}/${locator}` },
      rawText,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 120, overlapChars: 0 },
    });
  }

  async function ask(organizationId: string, query: string) {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(
      createKnowledgeSearchToolDefinition({
        retrievalPort: new DrizzleKnowledgeRetrievalService(db),
      }),
    );
    const grant = await issueTestToolGrant({ organizationId, snapshot });
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(grant),
    });
    const result = await engine.executeTool(
      { toolName: 'knowledge.search', rawArguments: { query, limit: 5 } },
      buildPublishedVersionToolExecutionContext(grant),
    );
    expect(result.status).toBe('SUCCESS');
    return knowledgeSearchToolOutputSchema.parse((result as { output: unknown }).output);
  }

  let orgA = '';
  let orgB = '';

  beforeAll(async () => {
    orgA = await createOrg('a');
    orgB = await createOrg('b');
    for (const [i, section] of SECTIONS.entries()) await ingest(orgA, `secao-${i}.md`, section);
    await ingest(orgB, 'helicopteros.md', 'Helicóptero H-125 à venda. Preço do helicóptero.');
  });

  /** Teardown escopado pelo `runId` (só as organizações criadas aqui), com prova de zero resíduos. */
  afterAll(async () => {
    try {
      const byOrg = [orgIds];
      await pool.query(
        'DELETE FROM knowledge_chunks WHERE organization_id = ANY($1::uuid[])',
        byOrg,
      );
      await pool.query(
        'DELETE FROM knowledge_documents WHERE organization_id = ANY($1::uuid[])',
        byOrg,
      );
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', byOrg);
      const left = await pool.query(
        `SELECT (SELECT count(*) FROM organizations WHERE id = ANY($1::uuid[]))
              + (SELECT count(*) FROM knowledge_documents WHERE organization_id = ANY($1::uuid[]))
              + (SELECT count(*) FROM knowledge_chunks WHERE organization_id = ANY($1::uuid[])) AS n`,
        byOrg,
      );
      expect(Number(left.rows[0].n)).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('homologation case: no evidence, no excerpt, and the missing product is named', async () => {
    const output = await ask(orgA, 'preço do helicóptero');
    expect(output).toMatchObject({ found: false, results: [], unmatchedTerms: ['helicoptero'] });
  });

  it('company name and commercial words never stand in for a missing product', async () => {
    for (const query of [
      'A Qualitec vende helicópteros?',
      'Qual o prazo de entrega do helicóptero?',
    ]) {
      const output = await ask(orgA, query);
      expect(output.found, query).toBe(false);
      expect(output.results, query).toEqual([]);
    }
  });

  it('transmitter question: both transmitters as direct evidence, first', async () => {
    const output = await ask(orgA, 'Quais transmissores de pressão a Qualitec oferece?');
    expect(output.found).toBe(true);
    expect(output.unmatchedTerms).toEqual([]);
    const top = output.results.slice(0, 2);
    expect(top.every((r) => r.relevance === 'DIRECT')).toBe(true);
    expect(top.map((r) => r.excerpt).join(' ')).toMatch(/QT-310[\s\S]*QT-520|QT-520[\s\S]*QT-310/);
  });

  it('price of a real product: product DIRECT first, price FAQ labelled CONTEXT', async () => {
    const output = await ask(orgA, 'Qual o preço do transmissor QT-310?');
    expect(output.results[0]).toMatchObject({ relevance: 'DIRECT' });
    expect(output.results[0]!.excerpt).toContain('QT-310');
    const faq = output.results.find((r) => r.excerpt.includes('orçamento'));
    expect(faq?.relevance).toBe('CONTEXT');
  });

  it('unknown word does not block a legitimate question and is reported', async () => {
    const output = await ask(orgA, 'transmissor de pressão modelo zxqw');
    expect(output.found).toBe(true);
    expect(output.unmatchedTerms).toEqual(['zxqw']);
  });

  it('tenant isolation: the other organization sells helicopters, never used for A', async () => {
    const own = await ask(orgA, 'helicóptero H-125');
    expect(own.found).toBe(false);
    const other = await ask(orgB, 'preço do helicóptero');
    expect(other.found).toBe(true);
    expect(other.results.every((r) => r.excerpt.includes('Helicóptero'))).toBe(true);
  });
});
