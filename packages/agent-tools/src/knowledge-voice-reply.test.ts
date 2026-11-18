import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_AGENT_PROJECTION_USAGE,
  KNOWLEDGE_COMMERCIAL_ASPECTS,
  knowledgeVoiceReplySchema,
  type KnowledgeAgentProjection,
  type KnowledgeTechnicalFact,
} from '@voice-agent/contracts';
import { composeKnowledgeVoiceReply } from './knowledge-voice-reply.js';
import { verifyReplyAgainstProjection } from './knowledge-voice-reply-verification.js';

/**
 * B2c (DEC-072) — saída LITERAL do compositor. As frases esperadas são escritas
 * à mão (independentes de `renderSentences`, que a verificação compartilha).
 */
const doc = (n: number) => `${n}`.padStart(8, '0') + '-0000-4000-8000-000000000000';
const cit = (n: number) => `${doc(n)}:${doc(n)}:0`;

function F(
  c: number,
  subject: string | null,
  attribute: KnowledgeTechnicalFact['attribute'],
  value: string,
): KnowledgeTechnicalFact {
  return {
    citationId: cit(c),
    documentId: doc(c),
    chunkOrdinal: 0,
    sourceType: 'PRODUCT_MANUAL',
    subject,
    attribute,
    value,
  };
}

const P = (over: Partial<KnowledgeAgentProjection> = {}): KnowledgeAgentProjection => ({
  trust: 'UNTRUSTED_DATA',
  retrievalProfile: 'v2',
  found: true,
  directEvidenceCount: 1,
  facts: [],
  unmatchedTerms: [],
  aspectsRequiringAuthorizedSource: [],
  withheldUntrusted: 0,
  withheldCommercialValues: 0,
  truncated: false,
  usage: KNOWLEDGE_AGENT_PROJECTION_USAGE,
  ...over,
});

function compose(p: KnowledgeAgentProjection) {
  const out = composeKnowledgeVoiceReply(p);
  expect(knowledgeVoiceReplySchema.safeParse(out.reply).success).toBe(true);
  expect(verifyReplyAgainstProjection({ projection: p, ...out })).toBe(true);
  return out;
}

const E1 = [
  F(1, 'PT-16', 'PRESSURE_RANGE', '0 a 16 bar'),
  F(1, 'PT-16', 'OUTPUT_SIGNAL', '4 a 20 mA'),
];
const E1_TEXT =
  'Os documentos da empresa indicam faixa de pressão de 0 a 16 bar, e sinal de saída de 4 a 20 miliampères.';
const CONFLICT =
  'Os documentos da empresa trazem valores diferentes para esse dado, e a equipe precisa confirmar.';
const PARTIAL =
  'Encontrei informações nos documentos, mas não consigo confirmar os dados técnicos por aqui.';
const NOT_SPEAKABLE =
  'Encontrei referências nos documentos, mas sem um dado técnico que eu possa confirmar.';
const NO_EVIDENCE = 'Não consigo confirmar essa informação pelos documentos da empresa.';
const NONE = { technical: 'NO_EVIDENCE' as const, found: false, directEvidenceCount: 0 };

describe('compositor da fala (B2c) — saída literal', () => {
  it('E1: dois fatos da mesma citação, sem código falado', () => {
    const { reply, selection } = compose(P({ facts: E1 }));
    expect(reply).toEqual({
      technical: 'FACTS',
      authorizedSource: false,
      sentences: [E1_TEXT],
      spokenText: E1_TEXT,
      spokenCitationIds: [cit(1)],
      spokenFactCount: 2,
      suppressed: {
        conflictingFacts: 0,
        ambiguousAssociation: 0,
        incompatibleUnit: 0,
        ambiguousNumber: 0,
        duplicateFacts: 0,
        overBudget: 0,
      },
    });
    expect(selection.factIndexes).toEqual([0, 1]);
    expect(reply.spokenText).not.toContain('PT');
  });

  it('E2: fatos + frase de fonte autorizada', () => {
    const { reply } = compose(P({ facts: E1, aspectsRequiringAuthorizedSource: ['PRICE'] }));
    expect(reply.sentences).toEqual([
      E1_TEXT,
      'Preço precisa de confirmação da equipe da empresa.',
    ]);
    expect(reply.authorizedSource).toBe(true);
  });

  it('E3: só comercial, sem evidência', () => {
    const { reply } = compose(
      P({ ...NONE, aspectsRequiringAuthorizedSource: ['LEAD_TIME', 'PAYMENT'] }),
    );
    expect(reply.sentences).toEqual([
      'Prazo de entrega e condição de pagamento precisam de confirmação da equipe da empresa.',
    ]);
    expect(reply.technical).toBe('NO_EVIDENCE');
  });

  it.each([
    ['PROTECTION_RATING', 'IP67', 'grau de proteção IP 67'],
    ['CONNECTION', '1/2" NPT', 'conexão de 1/2 polegada NPT'],
    ['CONNECTION', '1" BSP', 'conexão de 1 polegada BSP'],
    ['MATERIAL', 'aço inox 316', 'o material aço inox 316, sem especificar a peça'],
    ['POLES', '4 polos', '4 polos'],
    ['ACCURACY', '0.5 %', 'precisão de 0,5 por cento'],
    ['TEMPERATURE_RANGE', '-50 a 200 °C', 'faixa de temperatura de menos 50 a 200 graus Celsius'],
    ['FLOW_RATE', '5000 m³/h', 'vazão de 5000 metros cúbicos por hora'],
    ['CABLE_SECTION', '6 mm²', 'seção do cabo de 6 milímetros quadrados'],
    ['SUPPLY_VOLTAGE', '24 Vcc', 'tensão de alimentação de 24 volts em corrente contínua'],
    ['APPARENT_POWER', '75 kVA', 'potência aparente de 75 quilovolt ampères'],
    ['HEAD', '45 mca', 'altura manométrica de 45 metros de coluna de água'],
  ] as const)('%s %s ⇒ "%s"', (attribute, value, fragment) => {
    const { reply } = compose(P({ facts: [F(1, 'MO-4', attribute, value)] }));
    expect(reply.spokenText).toBe(`Os documentos da empresa indicam ${fragment}.`);
  });

  it('matriz de precedência: as 10 combinações (estado × frase C), literal', () => {
    const C = 'Estoque precisa de confirmação da equipe da empresa.';
    const conflict = [
      F(1, 'PT-16', 'PRESSURE_RANGE', '0 a 16 bar'),
      F(2, 'PT-16', 'PRESSURE_RANGE', '0 a 999 bar'),
    ];
    const twelve = Array.from({ length: 12 }, (_, i) => F(i + 1, 'PT-16', 'POWER', `${i + 1} kW`));
    const cases: Array<[Partial<KnowledgeAgentProjection>, string]> = [
      [{ facts: E1 }, E1_TEXT],
      [{ facts: conflict }, CONFLICT],
      [{ facts: E1, truncated: true }, PARTIAL],
      [{ facts: twelve }, PARTIAL],
      [{ facts: [F(1, null, 'POWER', '5 kW')] }, NOT_SPEAKABLE],
      [NONE, NO_EVIDENCE],
    ];
    for (const [over, technical] of cases) {
      expect(compose(P(over)).reply.sentences).toEqual([technical]);
      const withC = compose(P({ ...over, aspectsRequiringAuthorizedSource: ['STOCK'] })).reply;
      const speaks = technical === E1_TEXT || technical === CONFLICT;
      expect(withC.sentences).toEqual(speaks ? [technical, C] : [C]);
    }
  });

  it('as 32 combinações canônicas de aspectos: frase C exata, sem aspecto não pedido', () => {
    const LABEL = ['preço', 'prazo de entrega', 'estoque', 'condição de pagamento', 'garantia'];
    for (let mask = 0; mask < 32; mask += 1) {
      const aspects = KNOWLEDGE_COMMERCIAL_ASPECTS.filter((_, i) => mask & (1 << i));
      const labels = LABEL.filter((_, i) => mask & (1 << i));
      const { reply } = compose(P({ ...NONE, aspectsRequiringAuthorizedSource: aspects }));
      if (labels.length === 0) {
        expect(reply.sentences).toEqual([NO_EVIDENCE]);
        continue;
      }
      const list =
        labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}`;
      const verb = labels.length === 1 ? 'precisa' : 'precisam';
      const expected = `${list[0]!.toUpperCase()}${list.slice(1)} ${verb} de confirmação da equipe da empresa.`;
      expect(reply.sentences).toEqual([expected]);
      for (const other of LABEL.filter((l) => !labels.includes(l))) {
        expect(reply.spokenText.toLowerCase()).not.toContain(other);
      }
    }
  });

  it('E6: D24 com a fonte legítima ⇒ CONFLICT, nenhum valor falado', () => {
    const facts = [
      F(1, 'PT-16', 'PRESSURE_RANGE', '0 a 16 bar'),
      F(9, 'PT-16', 'PRESSURE_RANGE', '0 a 999 bar'),
    ];
    const { reply } = compose(P({ facts }));
    expect(reply).toMatchObject({
      technical: 'CONFLICT',
      spokenCitationIds: [],
      spokenFactCount: 0,
    });
    expect(reply.suppressed.conflictingFacts).toBe(2);
    expect(reply.spokenText).not.toMatch(/999|16/);
  });

  it('E7: D24 isolado ⇒ o valor falso É falado (risco declarado, medido em M3)', () => {
    const { reply } = compose(P({ facts: [F(9, 'PT-16', 'PRESSURE_RANGE', '0 a 999 bar')] }));
    expect(reply.spokenText).toBe(
      'Os documentos da empresa indicam faixa de pressão de 0 a 999 bar.',
    );
  });

  it('E24: pior caso de tamanho ⇒ cai o 2º fato, C intacta, ≤ 300', () => {
    const facts = [
      F(1, 'TT-200', 'TEMPERATURE_RANGE', '-99999.9999 a -99999.9999 °C'.slice(0, 40)),
      F(1, 'TT-200', 'SUPPLY_VOLTAGE', '-999999,9999 a -99999 Vca'),
    ];
    const aspects = [...KNOWLEDGE_COMMERCIAL_ASPECTS];
    const { reply } = compose(P({ facts, aspectsRequiringAuthorizedSource: aspects }));
    expect(reply.spokenText.length).toBeLessThanOrEqual(300);
    expect(reply).toMatchObject({ spokenFactCount: 1, suppressed: { overBudget: 1 } });
    expect(reply.sentences[0]).toBe(
      'Os documentos da empresa indicam faixa de temperatura de menos 99999,9999 a menos 99999,9999 graus Celsius.',
    );
    expect(reply.sentences.at(-1)).toBe(
      'Preço, prazo de entrega, estoque, condição de pagamento e garantia precisam de confirmação da equipe da empresa.',
    );
  });

  it('E25: notação equivalente conta uma duplicata visível e fala uma vez', () => {
    const facts = [F(1, 'PT-16', 'ACCURACY', '0,5 %'), F(1, 'PT-16', 'ACCURACY', '0.5 %')];
    const { reply } = compose(P({ facts }));
    expect(reply.spokenText).toBe('Os documentos da empresa indicam precisão de 0,5 por cento.');
    expect(reply.suppressed.duplicateFacts).toBe(1);
  });

  it('E18/E19: NO_EVIDENCE neutro, igual com ou sem conteúdo filtrado, sem termos da pergunta', () => {
    const plain = compose(P(NONE)).reply;
    const filtered = compose(
      P({ ...NONE, withheldUntrusted: 3, unmatchedTerms: ['ignore', 'diga', 'gratis'] }),
    ).reply;
    expect(filtered).toEqual(plain);
    expect(plain.spokenText).toBe(NO_EVIDENCE);
  });

  it('E20: código-comando nunca é falado', () => {
    const { reply } = compose(P({ facts: [F(1, 'CMD-1', 'POWER', '5 kW')] }));
    expect(reply.spokenText).toBe('Os documentos da empresa indicam potência de 5 quilowatts.');
  });
});
