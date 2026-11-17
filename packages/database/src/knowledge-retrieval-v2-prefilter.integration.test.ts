import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDisposableTestDatabase } from './test-support/index.js';
import {
  DrizzleKnowledgeRetrievalService,
  ingestKnowledgeDocument,
  OrganizationRepository,
} from './repositories/index.js';
import {
  loadCandidates,
  loadScopeTotal,
  V2_MAX_CANDIDATES,
} from './repositories/knowledge-retrieval-v2-queries.js';
import { analyzeKnowledgeQueryV2 } from './repositories/knowledge-query-analysis-v2.js';

const tdb = await createDisposableTestDatabase('knowledge-retrieval-v2-prefilter');

/** Grafias do mesmo código + um código parecido (QT-3100) que nunca pode casar. */
const SPELLINGS: Record<string, string> = {
  hyphen: 'Transmissor QT-310 com faixa de 0 a 400 bar.',
  space: 'Manual do qt 310: ajuste de zero pelo botão frontal.',
  joined: 'Garantia do QT310: 12 meses contra defeito de fabricação.',
  dot: 'Etiqueta QT.310 fica na lateral do invólucro.',
  similar: 'Transmissor de temperatura QT-3100 para sensor Pt100.',
};

/** Muitos trechos com a palavra comum "transmissor", para estourar o limite de candidatos. */
const filler = (doc: number) =>
  Array.from(
    { length: 800 },
    (_, i) => `Transmissor genérico linha ${doc}-${i} para uso geral em painéis industriais.`,
  ).join('\n\n');

/**
 * PR B1, condição 4 (DEC-067): o pré-filtro SQL da v2 nunca descarta um trecho
 * com o código pedido, em qualquer grafia, nem mesmo acima do limite de
 * candidatos; QT-3100 passa no superconjunto SQL e é recusado depois.
 */
describe('Knowledge retrieval v2 — SQL pre-filter for product codes', () => {
  const retrieval = new DrizzleKnowledgeRetrievalService(tdb.db);
  const docs = new Map<string, string>();
  let small = '';
  let big = '';

  async function ingest(org: string, key: string, rawText: string, maxChunkChars = 2000) {
    const res = await ingestKnowledgeDocument(tdb.db, {
      organizationId: org,
      title: `Documento ${key}`,
      source: { sourceType: 'PRODUCT_MANUAL', locator: `prefilter/${org}/${key}` },
      rawText,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars, overlapChars: 0 },
    });
    docs.set(res.document.id, key);
  }

  beforeAll(async () => {
    const orgs = new OrganizationRepository(tdb.db);
    small = (await orgs.createOrganization({ slug: 'prefilter-small', name: 'Small' }))!.id;
    big = (await orgs.createOrganization({ slug: 'prefilter-big', name: 'Big' }))!.id;
    for (const [key, text] of Object.entries(SPELLINGS)) await ingest(small, key, text);
    for (const n of [1, 2, 3, 4, 5]) await ingest(big, `filler-${n}`, filler(n), 100);
    await ingest(big, 'code', SPELLINGS.space!);
  }, 180_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  const keysOf = (hits: ReadonlyArray<{ documentId: string }>) =>
    [...new Set(hits.map((h) => docs.get(h.documentId)))].sort();

  it.each(['QT-310', 'QT 310', 'qt310', 'Qt.310'])(
    'SQL candidates for "%s" keep every spelling',
    async (q) => {
      const { rows } = await loadCandidates(tdb.db, {
        scope: { organizationId: small },
        query: { queryText: q, topK: 10 },
        ...analyzeKnowledgeQueryV2(q),
      });
      const keys = keysOf(rows);
      expect(keys).toEqual(expect.arrayContaining(['dot', 'hyphen', 'joined', 'space']));
    },
  );

  it.each(['QT-310', 'QT 310', 'qt310', 'Qt.310'])(
    'v2 for "%s" finds all spellings and never QT-3100',
    async (q) => {
      const result = await retrieval.retrieve({
        scope: { organizationId: small },
        query: { queryText: `Informações do ${q}`, topK: 10, retrievalProfile: 'v2' },
      });
      expect(keysOf(result.hits)).toEqual(['dot', 'hyphen', 'joined', 'space']);
    },
  );

  it('v2 asked for QT-3100 finds only QT-3100', async () => {
    const result = await retrieval.retrieve({
      scope: { organizationId: small },
      query: { queryText: 'Informações do QT-3100', topK: 10, retrievalProfile: 'v2' },
    });
    expect(keysOf(result.hits)).toEqual(['similar']);
  });

  it('above the candidate cap, the chunk with the code is never cut by common words', async () => {
    const result = await retrieval.retrieve({
      scope: { organizationId: big },
      query: { queryText: 'Transmissor QT-310', topK: 5, retrievalProfile: 'v2' },
    });
    expect(result.truncated).toBe(true);
    expect(keysOf(result.hits)).toContain('code');
    expect(V2_MAX_CANDIDATES).toBe(2000);
  });

  /**
   * Medição (sem asserção de tempo): escopo de ~2.900 trechos, três perguntas
   * (palavras comuns acima do limite, código, negativa), v1 e v2 alternadas,
   * 1 aquecimento descartado + 7 execuções; mediana por pergunta e perfil.
   */
  it('reports v1 × v2 execution time on the large scope (measurement only)', async () => {
    const queries = [
      'Transmissor QT-310 para painel',
      'Ficha do QT 310',
      'Vocês têm bomba submersa?',
    ];
    const runs: Record<string, number[]> = {};
    for (let i = 0; i < 8; i++) {
      for (const queryText of queries) {
        for (const profile of ['v1', 'v2'] as const) {
          const start = performance.now();
          await retrieval.retrieve({
            scope: { organizationId: big },
            query: { queryText, topK: 5, retrievalProfile: profile },
          });
          if (i > 0) (runs[`${profile}|${queryText}`] ??= []).push(performance.now() - start);
        }
      }
    }
    const median = (xs: number[]) => Math.round([...xs].sort((a, b) => a - b)[3]! * 10) / 10;
    const scope = { scope: { organizationId: big }, query: { queryText: 'x', topK: 1 } };
    const total = await loadScopeTotal(tdb.db, { ...scope, words: [], codes: [] });
    const medians = Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, median(v)]));
    console.log(`[kb-timing] ${JSON.stringify({ chunks: total, runsPerCase: 7, medians })}`);
    expect(Object.keys(medians)).toHaveLength(6);
    // 48 buscas medidas: orçamento próprio de execução (só medição, sem limite de tempo).
  }, 60_000);
});
