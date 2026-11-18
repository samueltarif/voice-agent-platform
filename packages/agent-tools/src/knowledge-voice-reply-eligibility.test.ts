import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_AGENT_PROJECTION_USAGE,
  type KnowledgeAgentProjection,
  type KnowledgeTechnicalFact,
} from '@voice-agent/contracts';
import { analyzeVoiceEligibility } from './knowledge-voice-reply-eligibility.js';
import { composeKnowledgeVoiceReply } from './knowledge-voice-reply.js';
import { verifyReplyAgainstProjection } from './knowledge-voice-reply-verification.js';

const doc = (n: number) => `${n}`.padStart(8, '0') + '-0000-4000-8000-000000000000';
const F = (
  c: number,
  subject: string | null,
  attribute: KnowledgeTechnicalFact['attribute'],
  value: string,
): KnowledgeTechnicalFact => ({
  citationId: `${doc(c)}:${doc(c)}:0`,
  documentId: doc(c),
  chunkOrdinal: 0,
  sourceType: 'PRODUCT_MANUAL',
  subject,
  attribute,
  value,
});
const P = (facts: KnowledgeTechnicalFact[]): KnowledgeAgentProjection => ({
  trust: 'UNTRUSTED_DATA',
  retrievalProfile: 'v2',
  found: true,
  directEvidenceCount: 1,
  facts,
  unmatchedTerms: [],
  aspectsRequiringAuthorizedSource: [],
  withheldUntrusted: 0,
  withheldCommercialValues: 0,
  truncated: false,
  usage: KNOWLEDGE_AGENT_PROJECTION_USAGE,
});
const NS = 'Encontrei referências nos documentos, mas sem um dado técnico que eu possa confirmar.';

describe('elegibilidade da fala (B2c)', () => {
  it('E8: subject = null isolado ⇒ nunca falado', () => {
    const { reply } = composeKnowledgeVoiceReply(P([F(1, null, 'PRESSURE_RANGE', '0 a 16 bar')]));
    expect(reply.spokenText).toBe(NS);
    expect(reply.suppressed.ambiguousAssociation).toBe(1);
  });

  it('dois null na mesma citação, e null em citação posterior: só a citação limpa fala', () => {
    const two = analyzeVoiceEligibility([
      F(1, null, 'POWER', '5 kW'),
      F(1, null, 'SPEED', '1750 rpm'),
    ]);
    expect(two).toMatchObject({ speakableIndexes: [], suppressed: { ambiguousAssociation: 2 } });
    const later = analyzeVoiceEligibility([
      F(1, 'MO-4', 'POWER', '4 cv'),
      F(2, null, 'POWER', '5 kW'),
    ]);
    expect(later).toMatchObject({ speakableIndexes: [0], suppressed: { ambiguousAssociation: 1 } });
  });

  it('E9: null + código na mesma citação ⇒ abstenção da citação, passa à próxima', () => {
    const facts = [
      F(1, null, 'POWER', '5 kW'),
      F(1, 'PT-16', 'OUTPUT_SIGNAL', '4 a 20 mA'),
      F(2, 'MO-4', 'SPEED', '1750 rpm'),
    ];
    const e = analyzeVoiceEligibility(facts);
    expect(e).toMatchObject({ speakableIndexes: [2], suppressed: { ambiguousAssociation: 2 } });
  });

  it('E4: vários produtos na citação ⇒ NOT_SPEAKABLE', () => {
    const { reply } = composeKnowledgeVoiceReply(
      P([
        F(1, 'PT-16', 'PRESSURE_RANGE', '0 a 16 bar'),
        F(1, 'PT-25', 'PRESSURE_RANGE', '0 a 25 bar'),
      ]),
    );
    expect(reply).toMatchObject({
      technical: 'NOT_SPEAKABLE',
      suppressed: { ambiguousAssociation: 2 },
    });
  });

  it('mesmo atributo com valores diferentes na citação ⇒ abstenção e conflito', () => {
    const e = analyzeVoiceEligibility([
      F(1, 'MO-4', 'POWER', '4 cv'),
      F(1, 'MO-4', 'POWER', '5 cv'),
    ]);
    expect(e).toMatchObject({
      speakableIndexes: [],
      conflict: false,
      suppressed: { ambiguousAssociation: 2, conflictingFacts: 2 },
    });
  });

  it('MATERIAL genérico: dois materiais do produto não são conflito, mas nenhum é falado', () => {
    const sameCitation = analyzeVoiceEligibility([
      F(1, 'VB-25', 'MATERIAL', 'aço inox 304'),
      F(1, 'VB-25', 'MATERIAL', 'PTFE'),
    ]);
    expect(sameCitation).toMatchObject({
      speakableIndexes: [],
      suppressed: { ambiguousAssociation: 2, conflictingFacts: 0 },
    });
    const facts = [
      F(1, 'VB-25', 'DIMENSION', '25 mm'),
      F(1, 'VB-25', 'MATERIAL', 'aço inox 304'),
      F(2, 'VB-25', 'MATERIAL', 'PTFE'),
    ];
    const { reply, selection } = composeKnowledgeVoiceReply(P(facts));
    expect(reply.spokenText).toBe('Os documentos da empresa indicam dimensão de 25 milímetros.');
    expect(reply.technical).toBe('FACTS');
    expect(reply.suppressed).toMatchObject({ conflictingFacts: 0, ambiguousAssociation: 2 });
    expect(verifyReplyAgainstProjection({ projection: P(facts), reply, selection })).toBe(true);
    // Forçar a fala de um material contestado é recusado pela verificação.
    const forced = { ...selection, factIndexes: [0, 1] };
    expect(verifyReplyAgainstProjection({ projection: P(facts), reply, selection: forced })).toBe(
      false,
    );
  });

  it('MATERIAL único é falado sem afirmar a peça', () => {
    const { reply } = composeKnowledgeVoiceReply(P([F(1, 'BC-30', 'MATERIAL', 'bronze')]));
    expect(reply.spokenText).toBe(
      'Os documentos da empresa indicam o material bronze, sem especificar a peça.',
    );
    expect(reply.spokenText).not.toMatch(/corpo|vedação|rotor|condutor/);
  });

  it('E10/E11: unidade incompatível e número ambíguo ⇒ não falados', () => {
    expect(
      analyzeVoiceEligibility([F(1, 'PT-16', 'PRESSURE', '12 kg')]).suppressed.incompatibleUnit,
    ).toBe(1);
    expect(
      analyzeVoiceEligibility([F(1, 'PT-16', 'PRESSURE', '1.000 bar')]).suppressed.ambiguousNumber,
    ).toBe(1);
    expect(
      analyzeVoiceEligibility([F(1, 'PT-16', 'PRESSURE', '1,000 bar')]).speakableIndexes,
    ).toEqual([0]);
  });

  it('unidades diferentes ou número ambíguo na mesma chave ⇒ conflito', () => {
    const units = [F(1, 'PT-16', 'PRESSURE', '16 bar'), F(2, 'PT-16', 'PRESSURE', '232 psi')];
    expect(analyzeVoiceEligibility(units).conflict).toBe(true);
    const ambiguous = [
      F(1, 'PT-16', 'PRESSURE', '1000 bar'),
      F(2, 'PT-16', 'PRESSURE', '1.000 bar'),
    ];
    expect(analyzeVoiceEligibility(ambiguous).conflict).toBe(true);
  });

  it('duplicata conta só o que a projeção mostra (B2b já removeu as exatas)', () => {
    const facts = [
      F(1, 'PT-16', 'ACCURACY', '0,5 %'),
      F(2, 'PT-16', 'ACCURACY', '0.50 %'),
      F(2, 'PT-16', 'POWER', '5 kW'),
    ];
    const e = analyzeVoiceEligibility(facts);
    expect(e.suppressed.duplicateFacts).toBe(1);
    expect(e.conflict).toBe(false);
    expect(
      analyzeVoiceEligibility([F(1, 'PT-16', 'ACCURACY', '0,5 %')]).suppressed.duplicateFacts,
    ).toBe(0);
  });

  it('índices de 0 até o último fato: citação elegível no fato 9 e no 11 (último com 12 fatos)', () => {
    const filler = (n: number) =>
      Array.from({ length: n }, (_, i) => F(i + 1, null, 'POWER', `${i + 1} kW`));
    const at9 = [...filler(9), F(50, 'MO-4', 'SPEED', '1750 rpm'), F(50, 'MO-4', 'POWER', '4 cv')];
    const nine = composeKnowledgeVoiceReply(P(at9));
    expect(nine.selection.factIndexes).toEqual([9, 10]);
    expect(nine.reply.spokenText).toBe(
      'Os documentos da empresa indicam rotação de 1750 rotações por minuto, e potência de 4 cavalos.',
    );
    expect(verifyReplyAgainstProjection({ projection: P(at9), ...nine })).toBe(true);
    const at11 = [...filler(11), F(50, 'MO-4', 'SPEED', '1750 rpm')];
    expect(analyzeVoiceEligibility(at11).speakableIndexes).toEqual([11]);
    // Com 12 fatos a projeção pode ter sido cortada: PARTIAL, sem valores.
    expect(composeKnowledgeVoiceReply(P(at11)).reply.technical).toBe('PARTIAL');
    const at10 = [...filler(10), F(50, 'MO-4', 'SPEED', '1750 rpm')];
    expect(composeKnowledgeVoiceReply(P(at10)).selection.factIndexes).toEqual([10]);
  });

  it('conflito nas posições 1, 2 e 12 da projeção é detectado', () => {
    for (const position of [0, 1, 11]) {
      const facts = Array.from({ length: 12 }, (_, i) => F(i + 1, `MO-${i + 1}`, 'POWER', '4 cv'));
      facts[position] = F(99, 'MO-1', 'POWER', '9 cv');
      if (position === 0) facts[1] = F(98, 'MO-1', 'POWER', '4 cv');
      expect([position, analyzeVoiceEligibility(facts).suppressed.conflictingFacts]).toEqual([
        position,
        2,
      ]);
    }
  });

  it('permutação da ordem não muda o estado de conflito', () => {
    const a = F(1, 'PT-16', 'PRESSURE_RANGE', '0 a 16 bar');
    const b = F(2, 'PT-16', 'PRESSURE_RANGE', '0 a 999 bar');
    expect(composeKnowledgeVoiceReply(P([a, b])).reply.technical).toBe('CONFLICT');
    expect(composeKnowledgeVoiceReply(P([b, a])).reply.technical).toBe('CONFLICT');
  });

  it('a matriz atributo × unidade: permitidas faladas, proibidas não', () => {
    expect(analyzeVoiceEligibility([F(1, 'PT-16', 'CURRENT', '20 mA')]).speakableIndexes).toEqual([
      0,
    ]);
    for (const [attribute, value] of [
      ['TEMPERATURE', '16 bar'],
      ['WEIGHT', '5 kW'],
      ['ACCURACY', '5 mm'],
      ['HEAD', '45 m'],
    ] as const) {
      expect([
        attribute,
        analyzeVoiceEligibility([F(1, 'PT-16', attribute, value)]).suppressed.incompatibleUnit,
      ]).toEqual([attribute, 1]);
    }
  });
});
