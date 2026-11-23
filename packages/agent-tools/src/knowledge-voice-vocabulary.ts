import {
  KNOWLEDGE_TECHNICAL_SECTORS,
  type KnowledgeCommercialAspect,
  type KnowledgeTechnicalAttribute,
  type KnowledgeTechnicalUnit,
} from '@voice-agent/contracts';

/**
 * Vocabulário FECHADO da fala da B2c (DEC-072): rótulos de atributo, unidades
 * por extenso, aspectos comerciais e frases fixas. Tudo cabe no alfabeto do
 * contrato (`KNOWLEDGE_VOICE_ALPHABET`), o que um teste confere. Nenhuma
 * palavra vem de documento, pergunta ou título.
 */
export const KNOWLEDGE_VOICE_ATTRIBUTE_LABELS: Readonly<
  Record<KnowledgeTechnicalAttribute, string>
> = {
  PRESSURE: 'pressão',
  PRESSURE_RANGE: 'faixa de pressão',
  TEMPERATURE: 'temperatura',
  TEMPERATURE_RANGE: 'faixa de temperatura',
  OUTPUT_SIGNAL: 'sinal de saída',
  SUPPLY_VOLTAGE: 'tensão de alimentação',
  VOLTAGE: 'tensão',
  CURRENT: 'corrente',
  POWER: 'potência',
  APPARENT_POWER: 'potência aparente',
  FREQUENCY: 'frequência',
  ACCURACY: 'precisão',
  DIMENSION: 'dimensão',
  WEIGHT: 'peso',
  CABLE_SECTION: 'seção do cabo',
  POLES: 'número de polos',
  SPEED: 'rotação',
  FLOW_RATE: 'vazão',
  HEAD: 'altura manométrica',
  COOLING_CAPACITY: 'capacidade de refrigeração',
  NOISE_LEVEL: 'nível de ruído',
  MATERIAL: 'material',
  PROTECTION_RATING: 'grau de proteção',
  CONNECTION: 'conexão',
};

export const KNOWLEDGE_VOICE_UNIT_WORDS: Readonly<Record<KnowledgeTechnicalUnit, string>> = {
  bar: 'bar',
  psi: 'psi',
  kPa: 'quilopascal',
  MPa: 'megapascal',
  mca: 'metros de coluna de água',
  '°C': 'graus Celsius',
  mA: 'miliampères',
  A: 'ampères',
  V: 'volts',
  Vcc: 'volts em corrente contínua',
  Vca: 'volts em corrente alternada',
  W: 'watts',
  kW: 'quilowatts',
  kVA: 'quilovolt ampères',
  cv: 'cavalos',
  Hz: 'hertz',
  '%': 'por cento',
  mm: 'milímetros',
  m: 'metros',
  'mm²': 'milímetros quadrados',
  kg: 'quilos',
  polos: 'polos',
  rpm: 'rotações por minuto',
  'm³/h': 'metros cúbicos por hora',
  'L/h': 'litros por hora',
  'L/min': 'litros por minuto',
  'BTU/h': 'BTUs por hora',
  dB: 'decibéis',
};

/** Rótulos minúsculos, na ordem canônica de `KNOWLEDGE_COMMERCIAL_ASPECTS`. */
export const KNOWLEDGE_VOICE_ASPECT_LABELS: Readonly<Record<KnowledgeCommercialAspect, string>> = {
  PRICE: 'preço',
  LEAD_TIME: 'prazo de entrega',
  STOCK: 'estoque',
  PAYMENT: 'condição de pagamento',
  WARRANTY: 'garantia',
};

export const KNOWLEDGE_VOICE_PHRASES = {
  factsLead: 'Os documentos da empresa indicam',
  conflict:
    'Os documentos da empresa trazem valores diferentes para esse dado, e a equipe precisa confirmar.',
  partial:
    'Encontrei informações nos documentos, mas não consigo confirmar os dados técnicos por aqui.',
  notSpeakable:
    'Encontrei referências nos documentos, mas sem um dado técnico que eu possa confirmar.',
  noEvidence: 'Não consigo confirmar essa informação pelos documentos da empresa.',
  authorizedOne: 'precisa de confirmação da equipe da empresa.',
  authorizedMany: 'precisam de confirmação da equipe da empresa.',
  /** MATERIAL é genérico: o extrator não sabe se é corpo, vedação, rotor ou condutor. */
  materialPartUnknown: 'sem especificar a peça',
  inch: 'polegada',
  minus: 'menos',
} as const;

/**
 * Unidades de atributo dependente da frase, espelhando os seletores do
 * extrator da B2b (`CONTEXTUAL_UNITS`). As demais vêm de `unitAttributes` dos
 * setores do contrato. Um teste confere que as chaves são exatamente as
 * `contextualUnits` declaradas pelos setores.
 */
export const KNOWLEDGE_VOICE_CONTEXTUAL_UNIT_ATTRIBUTES: Readonly<
  Partial<Record<KnowledgeTechnicalUnit, readonly KnowledgeTechnicalAttribute[]>>
> = {
  bar: ['PRESSURE', 'PRESSURE_RANGE'],
  psi: ['PRESSURE', 'PRESSURE_RANGE'],
  kPa: ['PRESSURE', 'PRESSURE_RANGE'],
  MPa: ['PRESSURE', 'PRESSURE_RANGE'],
  '°C': ['TEMPERATURE', 'TEMPERATURE_RANGE'],
  mA: ['OUTPUT_SIGNAL', 'CURRENT'],
  V: ['SUPPLY_VOLTAGE', 'VOLTAGE'],
  Vcc: ['SUPPLY_VOLTAGE', 'VOLTAGE'],
  Vca: ['SUPPLY_VOLTAGE', 'VOLTAGE'],
  '%': ['ACCURACY'],
};

function buildUnitMatrix(): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const sector of Object.values(KNOWLEDGE_TECHNICAL_SECTORS)) {
    for (const [unit, attribute] of Object.entries(sector.unitAttributes)) {
      pairs.add(`${attribute}|${unit}`);
    }
  }
  for (const [unit, attributes] of Object.entries(KNOWLEDGE_VOICE_CONTEXTUAL_UNIT_ATTRIBUTES)) {
    for (const attribute of attributes ?? []) pairs.add(`${attribute}|${unit}`);
  }
  return pairs;
}

/** Matriz atributo × unidade (pares que o extrator da B2b emite). */
const UNIT_MATRIX = buildUnitMatrix();

export const isVoiceUnitAllowed = (attribute: KnowledgeTechnicalAttribute, unit: string) =>
  UNIT_MATRIX.has(`${attribute}|${unit}`);
