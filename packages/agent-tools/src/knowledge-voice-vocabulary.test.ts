import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_COMMERCIAL_ASPECTS,
  KNOWLEDGE_TECHNICAL_ATTRIBUTES,
  KNOWLEDGE_TECHNICAL_MATERIALS,
  KNOWLEDGE_TECHNICAL_SECTORS,
  KNOWLEDGE_TECHNICAL_UNITS,
  KNOWLEDGE_VOICE_ALPHABET,
  knowledgeVoiceSentenceSchema,
} from '@voice-agent/contracts';
import {
  renderAuthorizedSourceSentence,
  renderFactFragment,
} from './knowledge-voice-reply-render.js';
import {
  isVoiceUnitAllowed,
  KNOWLEDGE_VOICE_ASPECT_LABELS,
  KNOWLEDGE_VOICE_ATTRIBUTE_LABELS,
  KNOWLEDGE_VOICE_CONTEXTUAL_UNIT_ATTRIBUTES,
  KNOWLEDGE_VOICE_PHRASES,
  KNOWLEDGE_VOICE_UNIT_WORDS,
} from './knowledge-voice-vocabulary.js';

const DOC = '55555555-5555-4555-8555-555555555555';
const fact = (attribute: (typeof KNOWLEDGE_TECHNICAL_ATTRIBUTES)[number], value: string) => ({
  citationId: `${DOC}:${DOC}:0`,
  documentId: DOC,
  chunkOrdinal: 0,
  sourceType: 'PRODUCT_MANUAL' as const,
  subject: 'PT-16',
  attribute,
  value,
});
const inAlphabet = (text: string) => [...text].every((ch) => KNOWLEDGE_VOICE_ALPHABET.includes(ch));
const sentence = (fragment: string) => `Os documentos da empresa indicam ${fragment}.`;

describe('vocabulário e alfabeto da fala (B2c)', () => {
  it('suficiência: todo rótulo, unidade, aspecto e frase fixa cabe no alfabeto', () => {
    const words = [
      ...Object.values(KNOWLEDGE_VOICE_ATTRIBUTE_LABELS),
      ...Object.values(KNOWLEDGE_VOICE_UNIT_WORDS),
      ...Object.values(KNOWLEDGE_VOICE_ASPECT_LABELS),
      ...Object.values(KNOWLEDGE_VOICE_PHRASES).map((p) => p.replace(/\.$/, '')),
    ];
    expect(words.filter((w) => !inAlphabet(w))).toEqual([]);
    expect(Object.keys(KNOWLEDGE_VOICE_ATTRIBUTE_LABELS).sort()).toEqual(
      [...KNOWLEDGE_TECHNICAL_ATTRIBUTES].sort(),
    );
    expect(Object.keys(KNOWLEDGE_VOICE_UNIT_WORDS).sort()).toEqual(
      [...KNOWLEDGE_TECHNICAL_UNITS].sort(),
    );
    expect(Object.keys(KNOWLEDGE_VOICE_ASPECT_LABELS)).toEqual([...KNOWLEDGE_COMMERCIAL_ASPECTS]);
  });

  it('rejeição: todo caractere de U+00A0 a U+00FF fora da lista, controles e largura zero', () => {
    const rejected: string[] = [];
    for (let code = 0xa0; code <= 0xff; code += 1) {
      const ch = String.fromCharCode(code);
      if (KNOWLEDGE_VOICE_ALPHABET.includes(ch)) continue;
      if (knowledgeVoiceSentenceSchema.safeParse(`Valor ${ch} aqui.`).success) rejected.push(ch);
    }
    expect(rejected).toEqual([]);
    for (const ch of [
      '×',
      '÷',
      'ª',
      'º',
      'ß',
      'ñ',
      '¿',
      '«',
      '»',
      'µ',
      '¶',
      '§',
      '\u0000',
      '\u0007',
      '\n',
      '\r',
      '\t',
      '​',
      '‍',
      ' ',
      '﻿',
      '$',
      '€',
      '@',
      '<',
      '>',
      '[',
      ']',
      '{',
      '}',
      '.',
      '-',
      '"',
      '°',
      '%',
      '²',
      '³',
    ]) {
      expect([ch, knowledgeVoiceSentenceSchema.safeParse(`Valor ${ch} aqui.`).success]).toEqual([
        ch,
        false,
      ]);
    }
  });

  it('todas as gramáticas sem unidade cabem no alfabeto: materiais, IP00–IP99 e roscas', () => {
    for (const material of KNOWLEDGE_TECHNICAL_MATERIALS) {
      expect(
        knowledgeVoiceSentenceSchema.safeParse(
          sentence(renderFactFragment(fact('MATERIAL', material))),
        ).success,
      ).toBe(true);
    }
    for (let n = 0; n <= 99; n += 1) {
      const ip = `IP${String(n).padStart(2, '0')}`;
      expect(renderFactFragment(fact('PROTECTION_RATING', ip))).toBe(
        `grau de proteção IP ${ip.slice(2)}`,
      );
    }
    for (const thread of ['1/2" NPT', '3/4" BSP', '1" NPT', '12/16" BSP']) {
      const spoken = sentence(renderFactFragment(fact('CONNECTION', thread)));
      expect([thread, knowledgeVoiceSentenceSchema.safeParse(spoken).success]).toEqual([
        thread,
        true,
      ]);
    }
  });

  it('a C nunca sai do alfabeto, nas 31 combinações não vazias', () => {
    for (let mask = 1; mask < 32; mask += 1) {
      const aspects = KNOWLEDGE_COMMERCIAL_ASPECTS.filter((_, i) => mask & (1 << i));
      expect(
        knowledgeVoiceSentenceSchema.safeParse(renderAuthorizedSourceSentence(aspects)).success,
      ).toBe(true);
    }
  });

  it('alinhamento com o vocabulário da B2b: unidades contextuais = as declaradas pelos setores', () => {
    const declared = Object.values(KNOWLEDGE_TECHNICAL_SECTORS).flatMap((s) => s.contextualUnits);
    expect(Object.keys(KNOWLEDGE_VOICE_CONTEXTUAL_UNIT_ATTRIBUTES).sort()).toEqual(
      [...declared].sort(),
    );
    for (const sector of Object.values(KNOWLEDGE_TECHNICAL_SECTORS)) {
      for (const [unit, attribute] of Object.entries(sector.unitAttributes)) {
        expect(isVoiceUnitAllowed(attribute!, unit)).toBe(true);
      }
    }
    // Toda unidade do vocabulário é falável para algum atributo.
    for (const unit of KNOWLEDGE_TECHNICAL_UNITS) {
      expect([
        unit,
        KNOWLEDGE_TECHNICAL_ATTRIBUTES.some((a) => isVoiceUnitAllowed(a, unit)),
      ]).toEqual([unit, true]);
    }
  });

  it('matriz atributo × unidade: células da revisão 3 (§3.5)', () => {
    const allowed: Record<string, string[]> = {
      PRESSURE: ['bar', 'psi', 'kPa', 'MPa'],
      PRESSURE_RANGE: ['bar', 'psi', 'kPa', 'MPa'],
      TEMPERATURE: ['°C'],
      TEMPERATURE_RANGE: ['°C'],
      OUTPUT_SIGNAL: ['mA'],
      CURRENT: ['mA', 'A'],
      SUPPLY_VOLTAGE: ['V', 'Vcc', 'Vca'],
      VOLTAGE: ['V', 'Vcc', 'Vca'],
      ACCURACY: ['%'],
      DIMENSION: ['mm', 'm'],
      WEIGHT: ['kg'],
      CABLE_SECTION: ['mm²'],
      POLES: ['polos'],
      POWER: ['W', 'kW', 'cv'],
      APPARENT_POWER: ['kVA'],
      FREQUENCY: ['Hz'],
      SPEED: ['rpm'],
      FLOW_RATE: ['m³/h', 'L/h', 'L/min'],
      HEAD: ['mca'],
      COOLING_CAPACITY: ['BTU/h'],
      NOISE_LEVEL: ['dB'],
      MATERIAL: [],
      PROTECTION_RATING: [],
      CONNECTION: [],
    };
    for (const attribute of KNOWLEDGE_TECHNICAL_ATTRIBUTES) {
      for (const unit of KNOWLEDGE_TECHNICAL_UNITS) {
        const expected = allowed[attribute]!.includes(unit);
        expect([attribute, unit, isVoiceUnitAllowed(attribute, unit)]).toEqual([
          attribute,
          unit,
          expected,
        ]);
      }
    }
  });
});
