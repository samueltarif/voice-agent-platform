import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_AGENT_PROJECTION_USAGE,
  knowledgeVoiceReplySchema,
  type KnowledgeAgentProjection,
  type KnowledgeTechnicalFact,
  type KnowledgeVoiceReply,
} from '@voice-agent/contracts';
import { composeKnowledgeVoiceReply } from './knowledge-voice-reply.js';
import type { VoiceReplySelection } from './knowledge-voice-reply-render.js';
import { verifyReplyAgainstProjection } from './knowledge-voice-reply-verification.js';

/**
 * B2c (DEC-072) — mutações: cada adulteração da resposta ou da seleção é
 * recusada pela verificação OU pelo schema. As respostas íntegras de partida
 * são literais escritas à mão.
 */
const doc = (n: number) => `${n}`.padStart(8, '0') + '-0000-4000-8000-000000000000';
const cit = (n: number) => `${doc(n)}:${doc(n)}:0`;
const F = (
  c: number,
  attribute: KnowledgeTechnicalFact['attribute'],
  value: string,
  subject: string | null = 'PT-16',
): KnowledgeTechnicalFact => ({
  citationId: cit(c),
  documentId: doc(c),
  chunkOrdinal: 0,
  sourceType: 'PRODUCT_MANUAL',
  subject,
  attribute,
  value,
});
const projection: KnowledgeAgentProjection = {
  trust: 'UNTRUSTED_DATA',
  retrievalProfile: 'v2',
  found: true,
  directEvidenceCount: 2,
  facts: [
    F(1, 'PRESSURE_RANGE', '0 a 16 bar'),
    F(1, 'OUTPUT_SIGNAL', '4 a 20 mA'),
    F(2, 'POWER', '5 kW', 'MO-4'),
    F(3, 'PRESSURE', '12 kg'),
  ],
  unmatchedTerms: [],
  aspectsRequiringAuthorizedSource: ['PRICE'],
  withheldUntrusted: 0,
  withheldCommercialValues: 0,
  truncated: false,
  usage: KNOWLEDGE_AGENT_PROJECTION_USAGE,
};
const T =
  'Os documentos da empresa indicam faixa de pressão de 0 a 16 bar, e sinal de saída de 4 a 20 miliampères.';
const C = 'Preço precisa de confirmação da equipe da empresa.';

const { reply, selection } = composeKnowledgeVoiceReply(projection);
const accepted = (r: KnowledgeVoiceReply, s: VoiceReplySelection = selection, p = projection) =>
  knowledgeVoiceReplySchema.safeParse(r).success &&
  verifyReplyAgainstProjection({ projection: p, reply: r, selection: s });
const withText = (sentences: string[]): KnowledgeVoiceReply => ({
  ...reply,
  sentences,
  spokenText: sentences.join(' '),
});

describe('verificação por remontagem (B2c)', () => {
  it('a resposta íntegra é a literal esperada e passa', () => {
    expect(reply.sentences).toEqual([T, C]);
    expect(selection).toEqual({ technical: 'FACTS', factIndexes: [0, 1], aspects: ['PRICE'] });
    expect(accepted(reply)).toBe(true);
  });

  it.each([
    ['valor trocado', T.replace('0 a 16', '0 a 99')],
    ['unidade trocada', T.replace('miliampères', 'ampères')],
    ['produto inserido', T.replace('indicam', 'indicam para o PT 16')],
    [
      'ordem trocada',
      'Os documentos da empresa indicam sinal de saída de 4 a 20 miliampères, e faixa de pressão de 0 a 16 bar.',
    ],
    ['fato omitido', 'Os documentos da empresa indicam faixa de pressão de 0 a 16 bar.'],
    ['código com hífen', T.replace('indicam', 'indicam PT-16')],
  ])('texto com %s ⇒ recusado', (_, mutated) => {
    expect(accepted(withText([mutated, C]))).toBe(false);
  });

  it('aspecto acrescentado ou omitido ⇒ recusado', () => {
    expect(
      accepted(withText([T, 'Preço e estoque precisam de confirmação da equipe da empresa.'])),
    ).toBe(false);
    expect(accepted({ ...withText([T]), authorizedSource: false })).toBe(false);
    expect(accepted(reply, { ...selection, aspects: ['PRICE', 'STOCK'] })).toBe(false);
    expect(accepted(reply, { ...selection, aspects: [] })).toBe(false);
  });

  it('contagem, citação e estado adulterados ⇒ recusados', () => {
    expect(accepted({ ...reply, spokenFactCount: 1 })).toBe(false);
    expect(accepted({ ...reply, spokenCitationIds: [cit(2)] })).toBe(false);
    expect(accepted({ ...reply, technical: 'CONFLICT' })).toBe(false);
    expect(accepted(reply, { ...selection, technical: 'CONFLICT' })).toBe(false);
  });

  it('índices fora da faixa, repetidos, de outra citação ou de fato não falável ⇒ recusados', () => {
    for (const factIndexes of [[0, 4], [-1], [0, 0], [0, 2], [3], [0, 1, 2], [0.5]]) {
      expect([factIndexes, accepted(reply, { ...selection, factIndexes })]).toEqual([
        factIndexes,
        false,
      ]);
    }
  });

  it('seleção de fato com subject = null ⇒ recusada mesmo com texto coerente', () => {
    const p = {
      ...projection,
      facts: [F(1, 'POWER', '5 kW', null)],
      aspectsRequiringAuthorizedSource: [],
    };
    const s: VoiceReplySelection = { technical: 'FACTS', factIndexes: [0], aspects: [] };
    const r: KnowledgeVoiceReply = {
      ...reply,
      authorizedSource: false,
      sentences: ['Os documentos da empresa indicam potência de 5 quilowatts.'],
      spokenText: 'Os documentos da empresa indicam potência de 5 quilowatts.',
      spokenFactCount: 1,
    };
    expect(accepted(r, s, p)).toBe(false);
  });
});
