import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_VOICE_ALPHABET,
  knowledgeVoiceReplySchema,
  knowledgeVoiceSentenceSchema,
} from './knowledge-voice-reply-contracts.js';

const DOC = '22222222-2222-4222-8222-222222222222';
const T = 'Os documentos da empresa indicam faixa de pressão de 0 a 16 bar.';
const C = 'Preço precisa de confirmação da equipe da empresa.';
const NE = 'Não consigo confirmar essa informação pelos documentos da empresa.';
const CF =
  'Os documentos da empresa trazem valores diferentes para esse dado, e a equipe precisa confirmar.';
const suppressed = {
  conflictingFacts: 0,
  ambiguousAssociation: 0,
  incompatibleUnit: 0,
  ambiguousNumber: 0,
  duplicateFacts: 0,
  overBudget: 0,
};
const facts = {
  technical: 'FACTS',
  authorizedSource: true,
  sentences: [T, C],
  spokenText: `${T} ${C}`,
  spokenCitationIds: [`${DOC}:${DOC}:0`],
  spokenFactCount: 1,
  suppressed,
};
const valid = (r: unknown) => knowledgeVoiceReplySchema.safeParse(r).success;
const say = (sentences: string[]) => ({ sentences, spokenText: sentences.join(' ') });

describe('contrato da resposta falada (B2c)', () => {
  it('aceita as formas da matriz de precedência', () => {
    expect(valid(facts)).toBe(true);
    const base = { ...facts, spokenCitationIds: [], spokenFactCount: 0 };
    expect(valid({ ...base, technical: 'CONFLICT', ...say([CF, C]) })).toBe(true);
    expect(valid({ ...base, technical: 'CONFLICT', authorizedSource: false, ...say([CF]) })).toBe(
      true,
    );
    expect(valid({ ...base, technical: 'NO_EVIDENCE', ...say([C]) })).toBe(true);
    expect(
      valid({ ...base, technical: 'NO_EVIDENCE', authorizedSource: false, ...say([NE]) }),
    ).toBe(true);
  });

  it.each([
    ['spokenText diferente das frases', { ...facts, spokenText: T }],
    ['fatos falados sem estado FACTS', { ...facts, technical: 'CONFLICT' }],
    ['FACTS sem citação', { ...facts, spokenCitationIds: [] }],
    ['FACTS sem fato', { ...facts, spokenFactCount: 0 }],
    ['C anunciada sem frase C', { ...facts, ...say([T]) }],
    ['frase C fora do fim', { ...facts, ...say([C, T]) }],
    ['frase C sem marcação', { ...facts, authorizedSource: false }],
    [
      'NO_EVIDENCE com frase técnica e C',
      {
        ...facts,
        technical: 'NO_EVIDENCE',
        spokenFactCount: 0,
        spokenCitationIds: [],
        ...say([NE, C]),
      },
    ],
    ['três frases', { ...facts, ...say([T, T, C]) }],
    ['três fatos', { ...facts, spokenFactCount: 3 }],
    ['duas citações', { ...facts, spokenCitationIds: [`${DOC}:${DOC}:0`, `${DOC}:${DOC}:1`] }],
    ['campo extra', { ...facts, projection: {} }],
    ['link', { ...facts, ...say(['Veja http em www agora.', C]) }],
    ['acima de 300 caracteres', { ...facts, ...say([`Os ${'a '.repeat(150)}fim.`, C]) }],
    ['suppressed com texto', { ...facts, suppressed: { ...suppressed, note: 'x' } }],
  ])('recusa %s', (_, reply) => {
    expect(valid(reply)).toBe(false);
  });

  it('frase: maiúscula inicial, um único ponto no fim, espaçamento da gramática', () => {
    for (const bad of [
      'os documentos.',
      'Sem ponto',
      'Dois. Pontos.',
      'Espaço  duplo.',
      'Vírgula ,solta.',
      'Vírgula,colada.',
      'Ponto .',
    ]) {
      expect([bad, knowledgeVoiceSentenceSchema.safeParse(bad).success]).toEqual([bad, false]);
    }
    expect(knowledgeVoiceSentenceSchema.safeParse('Precisão de 0,5 por cento.').success).toBe(true);
  });

  it('o alfabeto é uma lista explícita sem símbolos de unidade, moeda ou faixas Latin-1', () => {
    expect(KNOWLEDGE_VOICE_ALPHABET).not.toMatch(/[×÷ªº°%$€."\-²³]/);
    expect(new Set(KNOWLEDGE_VOICE_ALPHABET).size).toBe(KNOWLEDGE_VOICE_ALPHABET.length);
  });
});
