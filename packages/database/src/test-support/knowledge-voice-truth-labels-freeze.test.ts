import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isKnowledgeTechnicalValue,
  KNOWLEDGE_PRODUCT_CODE_PATTERN,
  KNOWLEDGE_TECHNICAL_ATTRIBUTES,
} from '@voice-agent/contracts';
import {
  ADVERSARIAL_ATTACKS,
  ADVERSARIAL_SUPPORT_DOCUMENTS,
  COMMERCIAL_VARIATION_QUESTIONS,
  TECHNICAL_QUESTIONS,
} from './fixtures/knowledge-adversarial-corpus.js';
import {
  HOSTILE_EVALUATION_DOCUMENTS,
  HOSTILE_EVALUATION_QUESTIONS,
} from './fixtures/knowledge-hostile-evaluation-corpus.js';
import {
  FALSE_TECHNICAL_FACTS,
  KNOWLEDGE_VOICE_TRUTH_LABELS_VERSION,
  QUESTION_ASSOCIATION_LABELS,
  TRUE_TECHNICAL_FACTS,
  type TruthFact,
} from './fixtures/knowledge-voice-truth-labels.js';

/**
 * B2c, ETAPA 1 — CONGELAMENTO dos rótulos M2/M3 (plano revisão 3 §7.5).
 * Qualquer mudança nos rótulos altera o hash e falha aqui. Os rótulos foram
 * publicados num commit isolado ANTES do compositor; mudá-los depois do ponto
 * de controle do operador invalida a medição.
 */
const FROZEN_LABELS_SHA256 = '4c65699ee81064bf5db60e2b7513f6a37199c18e74b8fb40948c07dd50775dbe';

const key = (fact: TruthFact) => `${fact.subject}|${fact.attribute}|${fact.value}`;
const corpusQuestionIds = [
  ...HOSTILE_EVALUATION_QUESTIONS.map((q) => q.id),
  ...ADVERSARIAL_ATTACKS.map((a) => a.id),
  ...TECHNICAL_QUESTIONS.map((q) => q.id),
  ...COMMERCIAL_VARIATION_QUESTIONS.map((q) => q.id),
];

describe('voice truth labels freeze (B2c, etapa 1)', () => {
  it('keeps the frozen labels unchanged (SHA-256)', () => {
    const labels = JSON.stringify({
      KNOWLEDGE_VOICE_TRUTH_LABELS_VERSION,
      TRUE_TECHNICAL_FACTS,
      FALSE_TECHNICAL_FACTS,
      QUESTION_ASSOCIATION_LABELS,
    });
    expect(createHash('sha256').update(labels).digest('hex')).toBe(FROZEN_LABELS_SHA256);
  });

  it('labels every question of the frozen corpus exactly once', () => {
    expect(new Set(corpusQuestionIds).size).toBe(corpusQuestionIds.length);
    expect(Object.keys(QUESTION_ASSOCIATION_LABELS).sort()).toEqual([...corpusQuestionIds].sort());
  });

  it('uses only the closed technical grammar of the contract', () => {
    for (const fact of [...TRUE_TECHNICAL_FACTS, ...FALSE_TECHNICAL_FACTS]) {
      expect([key(fact), KNOWLEDGE_PRODUCT_CODE_PATTERN.test(fact.subject)]).toEqual([
        key(fact),
        true,
      ]);
      expect([key(fact), isKnowledgeTechnicalValue(fact.attribute, fact.value)]).toEqual([
        key(fact),
        true,
      ]);
    }
    for (const [id, label] of Object.entries(QUESTION_ASSOCIATION_LABELS)) {
      if (label.product !== null)
        expect([id, KNOWLEDGE_PRODUCT_CODE_PATTERN.test(label.product)]).toEqual([id, true]);
      expect(label.askedAttributes.every((a) => KNOWLEDGE_TECHNICAL_ATTRIBUTES.includes(a))).toBe(
        true,
      );
    }
  });

  it('has no duplicated true fact and no fact both true and false', () => {
    const trueKeys = TRUE_TECHNICAL_FACTS.map(key);
    expect(new Set(trueKeys).size).toBe(trueKeys.length);
    expect(FALSE_TECHNICAL_FACTS.filter((fact) => trueKeys.includes(key(fact)))).toEqual([]);
  });

  it('classifies the isolated D24 value as FALSE (poisoning), never as true', () => {
    const d24 = { subject: 'PT-16', attribute: 'PRESSURE_RANGE', value: '0 a 999 bar' } as const;
    expect(FALSE_TECHNICAL_FACTS.map(key)).toContain(key(d24));
    expect(TRUE_TECHNICAL_FACTS.map(key)).not.toContain(key(d24));
    expect(TRUE_TECHNICAL_FACTS.map(key)).toContain('PT-16|PRESSURE_RANGE|0 a 16 bar');
    expect(QUESTION_ASSOCIATION_LABELS.D24).toEqual({
      product: 'PT-16',
      expectation: 'POISONING',
      askedAttributes: ['PRESSURE_RANGE'],
    });
    const poison = HOSTILE_EVALUATION_DOCUMENTS.find((d) => d.key === 'poison-d');
    expect(poison?.text).toContain('0 a 999 bar');
  });

  it('every true and false fact names a product present in the corpus documents', () => {
    const texts = [...HOSTILE_EVALUATION_DOCUMENTS, ...ADVERSARIAL_SUPPORT_DOCUMENTS].map(
      (d) => d.text,
    );
    for (const fact of [...TRUE_TECHNICAL_FACTS, ...FALSE_TECHNICAL_FACTS]) {
      expect([key(fact), texts.some((t) => t.includes(fact.subject))]).toEqual([key(fact), true]);
    }
  });

  it('agrees with the facts the frozen corpus already expects (labels ⊇ expectFacts)', () => {
    const trueKeys = new Set(TRUE_TECHNICAL_FACTS.map(key));
    const technical = [...HOSTILE_EVALUATION_QUESTIONS, ...TECHNICAL_QUESTIONS].filter(
      (q) => q.expectFacts?.length,
    );
    for (const q of technical) {
      const label = QUESTION_ASSOCIATION_LABELS[q.id]!;
      expect([q.id, label.expectation]).toEqual([q.id, 'TECHNICAL']);
      for (const e of q.expectFacts!) {
        expect([q.id, trueKeys.has(`${label.product}|${e.attribute}|${e.value}`)]).toEqual([
          q.id,
          true,
        ]);
      }
    }
  });

  it('every asked attribute of a TECHNICAL question has a true value for that product', () => {
    const trueKeys = TRUE_TECHNICAL_FACTS.map((fact) => `${fact.subject}|${fact.attribute}`);
    for (const [id, label] of Object.entries(QUESTION_ASSOCIATION_LABELS)) {
      if (label.expectation !== 'TECHNICAL') continue;
      for (const attribute of label.askedAttributes) {
        expect([id, trueKeys.includes(`${label.product}|${attribute}`)]).toEqual([id, true]);
      }
    }
  });
});
