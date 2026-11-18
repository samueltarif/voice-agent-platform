import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  KnowledgeRetrievalComparison,
  KnowledgeRetrievalPreview,
} from '@voice-agent/contracts';
import {
  ADVERSARIAL_DOCUMENTS,
  ADVERSARIAL_SUPPORT_DOCUMENTS,
  ALL_ADVERSARIAL_QUESTIONS,
  adversarialReport,
  createDisposableTestDatabase,
  createKnowledgeEvaluationFixture,
  createKnowledgeHostileEvaluationFixture,
  HOSTILE_EVALUATION_DOCUMENTS,
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

const DOCUMENTS = [
  ...HOSTILE_EVALUATION_DOCUMENTS,
  ...ADVERSARIAL_DOCUMENTS,
  ...ADVERSARIAL_SUPPORT_DOCUMENTS,
];
const ATTACK_DOCUMENT_KEYS = new Set(['known-d', 'unknown-d', 'known-d2', 'unknown-d2']);

/**
 * PR B2b (DEC-069, revisão): corpus CONGELADO da proteção contra documentos
 * hostis. Asserções DURAS: nenhum ataque (conhecido ou desconhecido) chega à
 * projeção do agente; nenhum texto bruto e nenhum valor comercial vaza;
 * passagem suspeita nunca é evidência; isolamento. As demais dimensões são
 * RELATADAS separadamente (dev/holdout). Corpus não é garantia de segurança.
 */
describe('Knowledge retrieval v2 — hostile documents and commercial authority (B2b)', () => {
  const results = new Map<string, KnowledgeRetrievalComparison>();
  const orgOf = new Map<string, EvaluationOrg>();
  const keyOf = new Map<string, string>();

  beforeAll(async () => {
    const run = Math.random().toString(36).slice(2, 8);
    const base = await createKnowledgeEvaluationFixture(tdb.db, run);
    const fx = await createKnowledgeHostileEvaluationFixture(tdb.db, run);
    for (const [id, key] of fx.documentKeys) {
      orgOf.set(id, 'D');
      keyOf.set(id, key);
    }
    for (const [id] of base.documentKeys) orgOf.set(id, 'A');
    const service = new DrizzleKnowledgeRetrievalComparisonService(tdb.db);
    for (const q of ALL_ADVERSARIAL_QUESTIONS) {
      const input = { organizationId: fx.orgD, queryText: q.query, topK: 10 };
      results.set(q.id, await service.compare(input));
    }
  }, 300_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  const v2 = (id: string) => results.get(id)!.v2;
  const previews = () =>
    new Map<string, KnowledgeRetrievalPreview>(
      ALL_ADVERSARIAL_QUESTIONS.map((q) => [q.id, v2(q.id)]),
    );
  const outcomes = () => ALL_ADVERSARIAL_QUESTIONS.map((q) => scoreHostileQuestion(q, v2(q.id)));

  it('no known or unknown attack and no commercial value reaches the agent projection', () => {
    const s = summarizeHostile(outcomes());
    expect(s.attackSuccessKnown).toEqual([]);
    expect(s.attackSuccessUnknown).toEqual([]);
    expect(s.commercialLeaks).toEqual([]);
    expect(s.suspiciousInEvidence).toBe(0);
    const canaries = [...results.values()].map((r) => JSON.stringify(r.v2.agentProjection ?? {}));
    expect(canaries.filter((t) => /CANARIO/i.test(t))).toEqual([]);
  });

  it('never copies raw document text into the agent projection', () => {
    const docs = DOCUMENTS.map((d) => d.text);
    for (const q of ALL_ADVERSARIAL_QUESTIONS) expect(rawTextLeaks(v2(q.id), docs)).toEqual([]);
  });

  it('keeps organization isolation in hits, suspicious passages and facts', () => {
    for (const q of ALL_ADVERSARIAL_QUESTIONS) {
      const p = v2(q.id);
      const ids = [
        ...p.hits.map((h) => h.documentId),
        ...(p.suspiciousPassages ?? []).map((s) => s.documentId),
        ...(p.agentProjection?.facts ?? []).map((f) => f.documentId),
      ];
      expect(ids.every((id) => orgOf.get(id) === 'D')).toBe(true);
    }
  });

  it('reports the B2b metrics separately (measurement, not a guarantee)', () => {
    const nonAttack = ALL_ADVERSARIAL_QUESTIONS.filter((q) => q.kind !== 'HOSTILE');
    const scored = nonAttack.map((q) => scoreQuestion(q, v2(q.id), orgOf));
    const legitimateSuspicious = [...results.values()].flatMap((r) =>
      (r.v2.suspiciousPassages ?? []).filter(
        (s) => !ATTACK_DOCUMENT_KEYS.has(keyOf.get(s.documentId)!),
      ),
    );
    const report = {
      ...adversarialReport({
        previews: previews(),
        detect: detectHostileContent,
        documents: DOCUMENTS.map((d) => d.text),
        legitimateSuspicious: legitimateSuspicious.length,
      }),
      retrievalDev: summarize(scored.filter((o) => o.split === 'dev')),
      retrievalHoldout: summarize(scored.filter((o) => o.split === 'holdout')),
    };
    console.log(`[kb-hostile] ${JSON.stringify(report)}`);
    expect(report.rawTextLeaks).toEqual([]);
    expect(report.commercialValueLeaks.monetaryOrPercentFacts).toEqual([]);
  });
});
