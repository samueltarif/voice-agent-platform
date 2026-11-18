import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ADVERSARIAL_ATTACKS,
  ADVERSARIAL_DOCUMENTS,
  ADVERSARIAL_SUPPORT_DOCUMENTS,
  COMMERCIAL_VARIATION_QUESTIONS,
  HOSTILE_EVALUATION_DOCUMENTS,
  HOSTILE_EVALUATION_QUESTIONS,
  LEGITIMATE_TRIGGER_PARAGRAPHS,
  TECHNICAL_QUESTIONS,
} from './index.js';

/**
 * CONGELAMENTO do corpus da B2b (revisão): o corpus foi completado ANTES de
 * qualquer novo ajuste de regra. Qualquer mudança nele altera o hash e falha
 * aqui — alterar o corpus exige trocar o hash de forma visível na revisão.
 */
const FROZEN_CORPUS_SHA256 = '3fd2c1baed85ed8526ee15dcfc5ab19cd4efe0c8746a9939f58cb9c61e699244';

describe('adversarial corpus freeze (B2b)', () => {
  it('keeps the frozen corpus unchanged', () => {
    const corpus = JSON.stringify({
      ADVERSARIAL_ATTACKS,
      ADVERSARIAL_DOCUMENTS,
      ADVERSARIAL_SUPPORT_DOCUMENTS,
      COMMERCIAL_VARIATION_QUESTIONS,
      HOSTILE_EVALUATION_DOCUMENTS,
      HOSTILE_EVALUATION_QUESTIONS,
      LEGITIMATE_TRIGGER_PARAGRAPHS,
      TECHNICAL_QUESTIONS,
    });
    expect(createHash('sha256').update(corpus).digest('hex')).toBe(FROZEN_CORPUS_SHA256);
  });

  it('has the approved minimum sizes (20 known, 20 unknown, 20 legitimate technical)', () => {
    const oldCanaries = HOSTILE_EVALUATION_DOCUMENTS.flatMap((d) =>
      d.text.split(/\n\s*\n/).filter((p) => p.includes('CANARIO')),
    );
    const known =
      ADVERSARIAL_ATTACKS.filter((a) => a.kind === 'KNOWN').length +
      oldCanaries.filter((p) => p.includes('CANARIO-K')).length;
    const unknown =
      ADVERSARIAL_ATTACKS.filter((a) => a.kind === 'UNKNOWN').length +
      oldCanaries.filter((p) => p.includes('CANARIO-U')).length;
    expect(known).toBeGreaterThanOrEqual(20);
    expect(unknown).toBeGreaterThanOrEqual(20);
    expect(TECHNICAL_QUESTIONS.length).toBeGreaterThanOrEqual(20);
    expect(LEGITIMATE_TRIGGER_PARAGRAPHS.length).toBeGreaterThanOrEqual(20);
    expect(
      ADVERSARIAL_ATTACKS.filter((a) => a.kind === 'UNKNOWN').every((a) => a.split === 'holdout'),
    ).toBe(true);
  });
});
