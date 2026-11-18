import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_AGENT_PROJECTION_USAGE,
  type KnowledgeAgentProjection,
  type KnowledgeCommercialAspect,
} from '@voice-agent/contracts';
import {
  areAspectsCanonical,
  isProjectionConsistent,
  preflightProjectionShape,
} from './knowledge-voice-reply-consistency.js';

const DOC = '55555555-5555-4555-8555-555555555555';
const CHUNK = '66666666-6666-4666-8666-666666666666';
const fact = {
  citationId: `${DOC}:${CHUNK}:3`,
  documentId: DOC,
  chunkOrdinal: 3,
  sourceType: 'PRODUCT_MANUAL',
  subject: 'PT-16',
  attribute: 'PRESSURE_RANGE',
  value: '0 a 16 bar',
} as const;
const P = (over: Partial<KnowledgeAgentProjection> = {}): KnowledgeAgentProjection => ({
  trust: 'UNTRUSTED_DATA',
  retrievalProfile: 'v2',
  found: true,
  directEvidenceCount: 1,
  facts: [fact],
  unmatchedTerms: [],
  aspectsRequiringAuthorizedSource: [],
  withheldUntrusted: 0,
  withheldCommercialValues: 0,
  truncated: false,
  usage: KNOWLEDGE_AGENT_PROJECTION_USAGE,
  ...over,
});

/** Array que conta acessos aos itens: prova que o comprimento é recusado antes de iterar. */
function spiedArray(length: number) {
  let reads = 0;
  const target = Array.from({ length }, () => 'PRICE');
  const proxy = new Proxy(target, {
    get(t, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1;
      return Reflect.get(t, key, receiver);
    },
  });
  return { proxy, reads: () => reads };
}

describe('coerência e pré-checagem da projeção (B2c)', () => {
  it('pré-checagem rasa: aspectos acima de 5 recusados pelo comprimento, sem iterar', () => {
    for (const length of [6, 10_000]) {
      const spy = spiedArray(length);
      expect(
        preflightProjectionShape({ ...P(), aspectsRequiringAuthorizedSource: spy.proxy }),
      ).toBe('INCONSISTENT_PROJECTION');
      expect(spy.reads()).toBe(0);
    }
    expect(preflightProjectionShape({ ...P(), aspectsRequiringAuthorizedSource: ['PRICE'] })).toBe(
      'OK',
    );
  });

  it('pré-checagem rasa: fatos e termos acima do teto ⇒ INVALID_PROJECTION sem iterar', () => {
    const facts = spiedArray(13);
    expect(preflightProjectionShape({ ...P(), facts: facts.proxy })).toBe('INVALID_PROJECTION');
    expect(facts.reads()).toBe(0);
    expect(preflightProjectionShape({ ...P(), unmatchedTerms: spiedArray(17).proxy })).toBe(
      'INVALID_PROJECTION',
    );
  });

  it('pré-checagem deixa formas estranhas para o safeParse (não decide sozinha)', () => {
    expect(preflightProjectionShape(null)).toBe('OK');
    expect(preflightProjectionShape({ hits: [] })).toBe('OK');
    expect(preflightProjectionShape({ aspectsRequiringAuthorizedSource: 'PRICE' })).toBe('OK');
  });

  it.each<[string, KnowledgeCommercialAspect[], boolean]>([
    ['vazio', [], true],
    ['canônico', ['PRICE', 'STOCK', 'WARRANTY'], true],
    ['todos', ['PRICE', 'LEAD_TIME', 'STOCK', 'PAYMENT', 'WARRANTY'], true],
    ['duplicado', ['PRICE', 'PRICE'], false],
    ['fora de ordem', ['STOCK', 'PRICE'], false],
    ['seis itens', ['PRICE', 'LEAD_TIME', 'STOCK', 'PAYMENT', 'WARRANTY', 'PRICE'], false],
  ])('aspectos %s ⇒ %s', (_, aspects, ok) => {
    expect(areAspectsCanonical(aspects)).toBe(ok);
    expect(isProjectionConsistent(P({ aspectsRequiringAuthorizedSource: aspects }))).toBe(ok);
  });

  it.each([
    ['found=false com fatos', P({ found: false, directEvidenceCount: 0 })],
    ['found=false com evidência', P({ found: false, facts: [] })],
    [
      'found=false com valor comercial retido',
      P({ found: false, facts: [], directEvidenceCount: 0, withheldCommercialValues: 1 }),
    ],
    ['found=true sem evidência', P({ directEvidenceCount: 0 })],
    ['documento diferente do prefixo da citação', P({ facts: [{ ...fact, documentId: CHUNK }] })],
    ['posição diferente do sufixo da citação', P({ facts: [{ ...fact, chunkOrdinal: 4 }] })],
    [
      'mesma citação com outro tipo de fonte',
      P({
        facts: [
          fact,
          { ...fact, attribute: 'OUTPUT_SIGNAL', value: '4 a 20 mA', sourceType: 'FAQ' },
        ],
      }),
    ],
  ])('%s ⇒ incoerente', (_, projection) => {
    expect(isProjectionConsistent(projection)).toBe(false);
  });

  it('projeções coerentes passam (com e sem evidência)', () => {
    expect(isProjectionConsistent(P())).toBe(true);
    expect(isProjectionConsistent(P({ found: false, directEvidenceCount: 0, facts: [] }))).toBe(
      true,
    );
  });
});
