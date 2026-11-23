import {
  KNOWLEDGE_TECHNICAL_UNITS,
  type KnowledgeTechnicalFact,
  type KnowledgeTechnicalUnit,
} from '@voice-agent/contracts';
import {
  isVoiceUnitAllowed,
  KNOWLEDGE_VOICE_PHRASES,
  KNOWLEDGE_VOICE_UNIT_WORDS,
} from './knowledge-voice-vocabulary.js';

/**
 * Leitura dos valores da projeção para a fala (B2c, DEC-072). O valor numérico
 * é desmontado por regex ANCORADA com a lista exata de unidades (mais longas
 * primeiro), nunca por troca de sufixo. Material, grau IP e rosca têm
 * gramática própria (já garantida pelo contrato da projeção).
 */
const NUM = String.raw`-?\d{1,6}(?:[.,]\d{1,4})?`;
const escapeUnit = (u: string) => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const UNITS_BY_LENGTH = [...KNOWLEDGE_TECHNICAL_UNITS].sort((a, b) => b.length - a.length);
const NUMERIC = new RegExp(
  `^(${NUM})(?: a (${NUM}))? (${UNITS_BY_LENGTH.map(escapeUnit).join('|')})$`,
);

export interface NumericVoiceValue {
  readonly from: string;
  readonly to: string | null;
  readonly unit: KnowledgeTechnicalUnit;
}

type Fact = Pick<KnowledgeTechnicalFact, 'attribute' | 'value'>;

const NAMED: ReadonlySet<string> = new Set(['MATERIAL', 'PROTECTION_RATING', 'CONNECTION']);

export function parseNumericVoiceValue(fact: Fact): NumericVoiceValue | null {
  if (NAMED.has(fact.attribute)) return null;
  const m = NUMERIC.exec(fact.value);
  if (!m) return null;
  return { from: m[1]!, to: m[2] ?? null, unit: m[3] as KnowledgeTechnicalUnit };
}

/**
 * Separador (ponto OU vírgula) seguido de exatamente 3 dígitos, com parte
 * inteira de 1 a 3 dígitos sem zero à esquerda ("1.000", "1,000", "12,500"):
 * pode ser milhar ou decimal conforme a localidade ⇒ AMBÍGUO, nunca falado
 * (DEC-072, ajuste A2). "0,500" (zero à esquerda) e "1234,567" (parte
 * inteira longa demais para agrupamento de milhar) são decimais.
 */
const isAmbiguousNumber = (n: string) => /^-?[1-9]\d{0,2}[.,]\d{3}$/.test(n);

export function hasAmbiguousNumber(fact: Fact): boolean {
  const n = parseNumericVoiceValue(fact);
  return n !== null && (isAmbiguousNumber(n.from) || (n.to !== null && isAmbiguousNumber(n.to)));
}

/** Par atributo × unidade dentro da matriz (gramáticas sem unidade sempre aceitas). */
export function hasCompatibleUnit(fact: Fact): boolean {
  if (NAMED.has(fact.attribute)) return true;
  const n = parseNumericVoiceValue(fact);
  return n !== null && isVoiceUnitAllowed(fact.attribute, n.unit);
}

const canonicalNumber = (n: string) => String(Number(n.replace(',', '.')));

/**
 * Chave de comparação do valor: "0,5 %" ≡ "0.5 %". Número ambíguo nunca é
 * equivalente a outro valor (chave própria); unidades diferentes nunca são
 * equivalentes (não há conversor validado).
 */
export function normalizedVoiceValue(fact: Fact): string {
  const n = parseNumericVoiceValue(fact);
  if (!n) return `raw:${fact.value}`;
  if (hasAmbiguousNumber(fact)) return `ambiguous:${fact.value}`;
  return `num:${canonicalNumber(n.from)}|${n.to === null ? '' : canonicalNumber(n.to)}|${n.unit}`;
}

const speakNumber = (n: string) =>
  n.startsWith('-')
    ? `${KNOWLEDGE_VOICE_PHRASES.minus} ${n.slice(1).replace('.', ',')}`
    : n.replace('.', ',');

/** Valor por extenso para a fala: decimal com vírgula, unidade da lista fechada. */
export function speakVoiceValue(fact: Fact): string {
  if (fact.attribute === 'PROTECTION_RATING') return fact.value.replace(/^IP/, 'IP ');
  if (fact.attribute === 'CONNECTION') {
    return fact.value.replace('" ', ` ${KNOWLEDGE_VOICE_PHRASES.inch} `);
  }
  const n = parseNumericVoiceValue(fact);
  if (!n) return fact.value;
  const range = n.to === null ? '' : ` a ${speakNumber(n.to)}`;
  return `${speakNumber(n.from)}${range} ${KNOWLEDGE_VOICE_UNIT_WORDS[n.unit]}`;
}
