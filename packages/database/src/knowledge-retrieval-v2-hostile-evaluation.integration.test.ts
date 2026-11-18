import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KnowledgeRetrievalComparison } from '@voice-agent/contracts';
import {
  createDisposableTestDatabase,
  createKnowledgeEvaluationFixture,
  createKnowledgeHostileEvaluationFixture,
  HOSTILE_EVALUATION_DOCUMENTS,
  HOSTILE_EVALUATION_QUESTIONS,
  rawTextLeaks,
  scoreHostileQuestion,
  scoreQuestion,
  summarize,
  summarizeHostile,
  type EvaluationOrg,
} from './test-support/index.js';
import { DrizzleKnowledgeRetrievalComparisonService } from './repositories/index.js';
import { detectHostileContent } from './repositories/knowledge-hostile-content-detector.js';

const tdb = await createDisposableTestDatabase('knowledge-retrieval-v2-hostile');

const paragraphs = (key: string) =>
  HOSTILE_EVALUATION_DOCUMENTS.find((d) => d.key === key)!
    .text.split(/\n\s*\n/)
    .filter((p) => p.includes('CANARIO') || key === 'manual-d');

/**
 * PR B2b (DEC-069): corpus da proteção contra documentos hostis, medido na
 * comparação administrativa. Asserções DURAS: nenhum ataque (conhecido ou
 * desconhecido pelo detector) chega à projeção do agente; nenhuma janela de
 * texto bruto vaza; passagem suspeita nunca é evidência; isolamento. As demais
 * métricas são RELATADAS. Corpus não é garantia contra ataques futuros.
 */
describe('Knowledge retrieval v2 — hostile documents and commercial authority (B2b)', () => {
  const results = new Map<string, KnowledgeRetrievalComparison>();
  const orgOf = new Map<string, EvaluationOrg>();

  beforeAll(async () => {
    const run = Math.random().toString(36).slice(2, 8);
    const base = await createKnowledgeEvaluationFixture(tdb.db, run);
    const fx = await createKnowledgeHostileEvaluationFixture(tdb.db, run);
    for (const [id] of fx.documentKeys) orgOf.set(id, 'D');
    for (const [id] of base.documentKeys) orgOf.set(id, 'A');
    const service = new DrizzleKnowledgeRetrievalComparisonService(tdb.db);
    for (const q of HOSTILE_EVALUATION_QUESTIONS) {
      results.set(
        q.id,
        await service.compare({ organizationId: fx.orgD, queryText: q.query, topK: 10 }),
      );
    }
  }, 180_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  const v2 = (id: string) => results.get(id)!.v2;
  const outcomes = () => HOSTILE_EVALUATION_QUESTIONS.map((q) => scoreHostileQuestion(q, v2(q.id)));

  it('no known or unknown attack and no commercial value reaches the agent projection', () => {
    const s = summarizeHostile(outcomes());
    expect(s.attackSuccessKnown).toEqual([]);
    expect(s.attackSuccessUnknown).toEqual([]);
    expect(s.commercialLeaks).toEqual([]);
    expect(s.suspiciousInEvidence).toBe(0);
  });

  it('never copies raw document text into the agent projection', () => {
    const docs = HOSTILE_EVALUATION_DOCUMENTS.map((d) => d.text);
    for (const q of HOSTILE_EVALUATION_QUESTIONS) expect(rawTextLeaks(v2(q.id), docs)).toEqual([]);
  });

  it('keeps organization isolation in hits, suspicious passages and facts', () => {
    for (const q of HOSTILE_EVALUATION_QUESTIONS) {
      const p = v2(q.id);
      const ids = [
        ...p.hits.map((h) => h.documentId),
        ...(p.suspiciousPassages ?? []).map((s) => s.documentId),
        ...(p.agentProjection?.facts ?? []).map((f) => f.documentId),
      ];
      expect(ids.every((id) => orgOf.get(id) === 'D')).toBe(true);
    }
  });

  it('reports the B2b metrics (measurement, not a guarantee)', () => {
    const scored = HOSTILE_EVALUATION_QUESTIONS.map((q) => scoreQuestion(q, v2(q.id), orgOf));
    const rate = (list: string[]) =>
      `${list.filter((p) => detectHostileContent(p).length > 0).length}/${list.length}`;
    const report = {
      hostile: summarizeHostile(outcomes()),
      retrieval: summarize(scored),
      retrievalDev: summarize(scored.filter((o) => o.split === 'dev')),
      retrievalHoldout: summarize(scored.filter((o) => o.split === 'holdout')),
      detectorKnown: rate(paragraphs('known-d')),
      detectorUnknown: rate(paragraphs('unknown-d')),
      detectorFalsePositivesInManual: rate(paragraphs('manual-d')),
    };
    console.log(`[kb-hostile] ${JSON.stringify(report)}`);
    expect(report.hostile.suspiciousInEvidence).toBe(0);
  });
});
