import type { EvaluationDocument } from './knowledge-evaluation-documents.js';
import type { EvaluationQuestion } from './knowledge-evaluation-questions.js';

/**
 * SOMENTE TESTES (PR B1, revisão de qualidade / DEC-067): casos NOVOS de
 * desenvolvimento, em outra organização e outro ramo (material elétrico),
 * escritos ANTES das correções da revisão. Servem para orientar as regras sem
 * memorizar o corpus original; o holdout original só é medido depois.
 * Fictícios; nenhum dado de cliente.
 */
const CATALOG_C = `LINHA DE PRODUTOS ELETROVALE 2026

A Eletrovale Distribuidora fornece material elétrico industrial para fábricas e prédios comerciais.

MOTORES ELÉTRICOS

Motor Trifásico MT-75
Potência de 7,5 cv, 4 polos, carcaça em ferro fundido, alimentação 220/380 V e frequência de 60 Hz. Grau de proteção IP55.

Motor Monofásico MM-20
Potência de 2 cv, 2 polos, para bombas d'água e compressores pequenos. Alimentação 127/220 V.

INVERSORES DE FREQUÊNCIA

Inversor de Frequência IF-22
Para motores de até 3 cv, entrada monofásica 220 V, controle vetorial e interface Modbus.

Inversor de Frequência IF-150
Para motores de até 20 cv, entrada trifásica 380 V, frenagem dinâmica e teclado removível.

DISJUNTORES

Disjuntor Tripolar DJ-63
Corrente nominal de 63 A, curva C, montagem em trilho DIN, para quadros de distribuição.

Disjuntor Motor DM-10
Proteção de motores de 6,3 a 10 A, com ajuste térmico e botão de rearme.

CABOS

Cabo Flexível CF-4
Cabo de cobre de 4 mm², isolação 750 V, rolos de 100 m.`;

const COMMERCIAL_C = `CONDIÇÕES COMERCIAIS ELETROVALE

Como recebo o preço?
Envie a lista de itens pelo site; o orçamento sai em até 2 dias úteis.

Qual o prazo de entrega dos motores?
Motores em estoque: entrega em 3 dias úteis na capital.

Preço dos inversores
Inversor IF-22: R$ 1.480,00 à vista.`;

export const EVALUATION_EXTENSION_DOCUMENTS: readonly EvaluationDocument[] = [
  { key: 'catalog-c', org: 'C', title: 'Linha de Produtos Eletrovale', text: CATALOG_C },
  { key: 'commercial-c', org: 'C', title: 'Condições Comerciais', text: COMMERCIAL_C },
];

const MOTORS = ['MT-75', 'MM-20'];
const INVERTERS = ['IF-22', 'IF-150'];
const BREAKERS = ['DJ-63', 'DM-10'];

const dev = (q: Omit<EvaluationQuestion, 'org' | 'split'>): EvaluationQuestion => ({
  ...q,
  org: 'C',
  split: 'dev',
});

export const EVALUATION_EXTENSION_QUESTIONS: readonly EvaluationQuestion[] = [
  // Família de produto: a palavra do assunto vem antes do complemento.
  dev({
    id: 'X01',
    kind: 'POSITIVE',
    query: 'Quais inversores de frequência vocês têm?',
    evidence: true,
    mustShow: INVERTERS,
    mustNotShow: [...MOTORS, ...BREAKERS, 'CF-4'],
  }),
  dev({
    id: 'X02',
    kind: 'POSITIVE',
    query: 'Quais motores elétricos vocês vendem?',
    evidence: true,
    mustShow: ['MT-75'],
    mustNotShow: [...BREAKERS, 'CF-4'],
  }),
  dev({
    id: 'X03',
    kind: 'POSITIVE',
    query: 'Disjuntor para quadro de distribuição',
    evidence: true,
    mustShow: ['DJ-63'],
    mustNotShow: [...MOTORS, ...INVERTERS, 'CF-4'],
  }),
  // Códigos: exato; parecido ou inexistente não substitui.
  dev({
    id: 'X04',
    kind: 'CODE',
    query: 'Ficha técnica do MT-75',
    evidence: true,
    mustShow: ['MT-75'],
    mustNotShow: ['MM-20', ...INVERTERS, ...BREAKERS],
  }),
  dev({ id: 'X05', kind: 'CODE', query: 'Vocês têm o inversor IF-220?', evidence: false }),
  dev({ id: 'X06', kind: 'CODE', query: 'Disjuntor DJ-6 tem?', evidence: false }),
  dev({ id: 'X07', kind: 'CODE', query: 'Motor MT 750 trifásico', evidence: false }),
  // Negativas com palavra parcialmente presente.
  dev({ id: 'X08', kind: 'NEGATIVE', query: 'Vocês vendem motor a diesel?', evidence: false }),
  dev({ id: 'X09', kind: 'NEGATIVE', query: 'Tem cabo de fibra óptica?', evidence: false }),
  dev({ id: 'X10', kind: 'NEGATIVE', query: 'Fazem instalação de painel solar?', evidence: false }),
  dev({
    id: 'X11',
    kind: 'NEGATIVE',
    query: 'Qual o preço do gerador a gasolina?',
    evidence: false,
  }),
  // Duas palavras raras, uma ausente: metade do assunto não é evidência.
  dev({ id: 'X15', kind: 'NEGATIVE', query: 'Tem disjuntor bipolar?', evidence: false }),
  dev({ id: 'X16', kind: 'NEGATIVE', query: 'Vocês têm cabo blindado?', evidence: false }),
  // Comerciais: valor explícito conta; política genérica não.
  dev({
    id: 'X12',
    kind: 'COMMERCIAL',
    query: 'Qual o preço do IF-22?',
    evidence: true,
    mustShow: ['R$ 1.480,00'],
    aspectsNotFound: [],
  }),
  dev({
    id: 'X13',
    kind: 'COMMERCIAL',
    query: 'Quanto custa o DJ-63?',
    evidence: true,
    mustShow: ['DJ-63'],
    mustNotShow: ['R$ 1.480,00'],
    aspectsNotFound: ['PRICE'],
  }),
  dev({
    id: 'X14',
    kind: 'COMMERCIAL',
    query: 'Qual o prazo de entrega do motor MT-75?',
    evidence: true,
    mustShow: ['MT-75'],
    aspectsNotFound: ['LEAD_TIME'],
  }),
];
