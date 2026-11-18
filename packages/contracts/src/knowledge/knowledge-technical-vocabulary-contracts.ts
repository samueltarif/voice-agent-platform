/**
 * Vocabulário técnico FECHADO e VERSIONADO da projeção do agente (B2b,
 * revisão). Organizado por setor empresarial para ser estendido sem liberar
 * texto livre: um setor novo declara atributos (enum) e unidades (lista); o
 * valor continua sendo número + unidade permitida, remontado pela plataforma.
 * Acrescentar um setor exige mudar ESTE arquivo (revisão de código), nunca um
 * documento ou uma configuração de cliente.
 */
export const KNOWLEDGE_TECHNICAL_VOCABULARY_VERSION = 'b2b-vocab-2' as const;

export const KNOWLEDGE_TECHNICAL_ATTRIBUTES = [
  'PRESSURE',
  'PRESSURE_RANGE',
  'TEMPERATURE',
  'TEMPERATURE_RANGE',
  'OUTPUT_SIGNAL',
  'SUPPLY_VOLTAGE',
  'VOLTAGE',
  'CURRENT',
  'POWER',
  'APPARENT_POWER',
  'FREQUENCY',
  'ACCURACY',
  'DIMENSION',
  'WEIGHT',
  'CABLE_SECTION',
  'POLES',
  'SPEED',
  'FLOW_RATE',
  'HEAD',
  'COOLING_CAPACITY',
  'NOISE_LEVEL',
  'MATERIAL',
  'PROTECTION_RATING',
  'CONNECTION',
] as const;
export type KnowledgeTechnicalAttribute = (typeof KNOWLEDGE_TECHNICAL_ATTRIBUTES)[number];

export const KNOWLEDGE_TECHNICAL_UNITS = [
  'bar',
  'psi',
  'kPa',
  'MPa',
  'mca',
  '°C',
  'mA',
  'A',
  'V',
  'Vcc',
  'Vca',
  'W',
  'kW',
  'kVA',
  'cv',
  'Hz',
  '%',
  'mm',
  'm',
  'mm²',
  'kg',
  'polos',
  'rpm',
  'm³/h',
  'L/h',
  'L/min',
  'BTU/h',
  'dB',
] as const;
export type KnowledgeTechnicalUnit = (typeof KNOWLEDGE_TECHNICAL_UNITS)[number];

export interface KnowledgeTechnicalSector {
  readonly attributes: readonly KnowledgeTechnicalAttribute[];
  /** Unidades cujo atributo NÃO depende do contexto da frase. */
  readonly unitAttributes: Readonly<
    Partial<Record<KnowledgeTechnicalUnit, KnowledgeTechnicalAttribute>>
  >;
  /** Unidades cujo atributo depende da frase (faixa, alimentação, saída, precisão). */
  readonly contextualUnits: readonly KnowledgeTechnicalUnit[];
}

/** Setores atendidos. Todo atributo e toda unidade pertencem a algum setor. */
export const KNOWLEDGE_TECHNICAL_SECTORS: Readonly<Record<string, KnowledgeTechnicalSector>> = {
  GENERAL: {
    attributes: ['DIMENSION', 'WEIGHT', 'MATERIAL', 'PROTECTION_RATING', 'CONNECTION'],
    unitAttributes: { mm: 'DIMENSION', m: 'DIMENSION', kg: 'WEIGHT' },
    contextualUnits: [],
  },
  INSTRUMENTATION: {
    attributes: [
      'PRESSURE',
      'PRESSURE_RANGE',
      'TEMPERATURE',
      'TEMPERATURE_RANGE',
      'OUTPUT_SIGNAL',
      'ACCURACY',
    ],
    unitAttributes: {},
    contextualUnits: ['bar', 'psi', 'kPa', 'MPa', '°C', 'mA', '%'],
  },
  ELECTRICAL: {
    attributes: ['SUPPLY_VOLTAGE', 'VOLTAGE', 'CURRENT', 'CABLE_SECTION', 'POLES'],
    unitAttributes: { A: 'CURRENT', 'mm²': 'CABLE_SECTION', polos: 'POLES' },
    contextualUnits: ['V', 'Vcc', 'Vca'],
  },
  MOTORS_AND_POWER: {
    attributes: ['POWER', 'APPARENT_POWER', 'FREQUENCY', 'SPEED'],
    unitAttributes: {
      W: 'POWER',
      kW: 'POWER',
      cv: 'POWER',
      kVA: 'APPARENT_POWER',
      Hz: 'FREQUENCY',
      rpm: 'SPEED',
    },
    contextualUnits: [],
  },
  PUMPING_AND_PNEUMATICS: {
    attributes: ['FLOW_RATE', 'HEAD'],
    unitAttributes: { 'm³/h': 'FLOW_RATE', 'L/h': 'FLOW_RATE', 'L/min': 'FLOW_RATE', mca: 'HEAD' },
    contextualUnits: [],
  },
  HVAC: {
    attributes: ['COOLING_CAPACITY', 'NOISE_LEVEL'],
    unitAttributes: { 'BTU/h': 'COOLING_CAPACITY', dB: 'NOISE_LEVEL' },
    contextualUnits: [],
  },
};

export const KNOWLEDGE_TECHNICAL_MATERIALS = [
  'aço inox 316',
  'aço inox 304',
  'aço carbono',
  'ferro fundido',
  'latão',
  'bronze',
  'alumínio',
  'cobre',
  'PVC',
  'PTFE',
  'polipropileno',
] as const;
