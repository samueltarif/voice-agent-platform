import { describe, expect, it } from 'vitest';
import {
  askedAspectTerms,
  classifyPassageV2,
  planTermsV2,
  type PassageMatch,
  type TermStats,
} from './knowledge-evidence-classifier-v2.js';
import { aspectsNotFound, isAspectInformed } from './knowledge-commercial-evidence.js';
import { normalizeScores, rawPassageScore } from './knowledge-passage-ranking.js';

const stat = (term: string, central: boolean, idf: number, passageFrequency = 1): TermStats => ({
  term,
  central,
  idf,
  passageFrequency,
});
const match = (inText: number[], inHeading: boolean[] = inText.map(() => false)): PassageMatch => ({
  inText,
  inHeading,
});

// Pergunta: "preço do QT-310" → código, aspecto de preço (não central).
const codeStats = [stat('qt310', true, 2), stat('preco', false, 0.5)];
const codePlan = planTermsV2(codeStats, new Set(['qt310']));
const classify = (m: PassageMatch, stats = codeStats, plan = codePlan) =>
  classifyPassageV2({ match: m, plan, stats, askedAspectTerms: askedAspectTerms(['PRICE']) });

describe('planTermsV2', () => {
  it('códigos encontrados são as âncoras', () => {
    expect(codePlan).toEqual({ matchedCentral: [0], anchors: [0], unmatched: [] });
  });

  it('sem código, âncora é a central mais específica; ausentes viram unmatched', () => {
    const stats = [stat('valvula', true, 1), stat('esfera', true, 2), stat('titanio', true, 3, 0)];
    expect(planTermsV2(stats, new Set())).toEqual({
      matchedCentral: [0, 1],
      anchors: [1],
      unmatched: ['titanio'],
    });
  });
});

describe('classifyPassageV2', () => {
  it('DIRECT quando a passagem tem a âncora no texto', () => {
    expect(classify(match([1, 0]))).toBe('DIRECT');
  });

  it('código só no título da seção + termo no texto = DIRECT', () => {
    expect(classify(match([0, 1], [true, false]))).toBe('DIRECT');
  });

  it('título sozinho, sem nenhum termo no texto, não é DIRECT', () => {
    expect(classify(match([0, 0], [true, false]))).toBeNull();
  });

  it('só o aspecto pedido, sem central = CONTEXT', () => {
    expect(classify(match([0, 1]))).toBe('CONTEXT');
  });

  it('nada da pergunta = descartada', () => {
    expect(classify(match([0, 0]))).toBeNull();
  });

  it('sem âncora não é DIRECT, mesmo com outra central', () => {
    const stats = [stat('valvula', true, 1), stat('esfera', true, 2)];
    const plan = planTermsV2(stats, new Set());
    expect(classify(match([3, 0]), stats, plan)).toBeNull();
  });

  it('nenhuma central encontrada no escopo = sem resultado', () => {
    const stats = [stat('titanio', true, 3, 0), stat('preco', false, 0.5)];
    const plan = planTermsV2(stats, new Set());
    expect(classify(match([0, 1]), stats, plan)).toBeNull();
  });
});

describe('aspectos comerciais (D-RB5)', () => {
  const ev = (foldedText: string, foldedHeading = '') => ({ foldedText, foldedHeading });

  it('preço informado exige termo do aspecto e valor explícito', () => {
    expect(isAspectInformed('PRICE', ev('qt-310 r$ 980,00', 'tabela de precos'))).toBe(true);
    expect(isAspectInformed('PRICE', ev('preco sob consulta'))).toBe(false);
    expect(isAspectInformed('PRICE', ev('faixa de 0 a 400 bar'))).toBe(false);
  });

  it('prazo e garantia', () => {
    expect(isAspectInformed('LEAD_TIME', ev('prazo de entrega: 15 dias uteis'))).toBe(true);
    expect(isAspectInformed('WARRANTY', ev('garantia de 12 meses'))).toBe(true);
  });

  it('lista os aspectos pedidos sem valor nas evidências diretas', () => {
    const direct = [ev('preco r$ 980,00')];
    expect(aspectsNotFound(['PRICE', 'PAYMENT'], direct)).toEqual(['PAYMENT']);
    expect(aspectsNotFound(['PRICE'], [])).toEqual(['PRICE']);
  });
});

describe('ranking v2', () => {
  const stats = [stat('valvula', true, 1), stat('esfera', true, 2)];
  const base = { inTitle: [false, false], length: 100, centralPositions: [[], []] };

  it('mais termos centrais pontuam mais', () => {
    const both = rawPassageScore({ ...base, match: match([1, 1]) }, stats, 100);
    const one = rawPassageScore({ ...base, match: match([1, 0]) }, stats, 100);
    expect(both).toBeGreaterThan(one);
  });

  it('proximidade entre centrais dá bônus', () => {
    const far = rawPassageScore(
      { ...base, match: match([1, 1]), centralPositions: [[0], [200]] },
      stats,
      100,
    );
    const near = rawPassageScore(
      { ...base, match: match([1, 1]), centralPositions: [[0], [10]] },
      stats,
      100,
    );
    expect(near).toBeGreaterThan(far);
  });

  it('normaliza relativo à melhor passagem', () => {
    expect(normalizeScores([2, 1, 0])).toEqual([1, 0.5, 0]);
    expect(normalizeScores([0])).toEqual([0]);
  });
});
