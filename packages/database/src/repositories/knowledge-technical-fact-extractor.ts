import {
  isKnowledgeTechnicalValue,
  KNOWLEDGE_PRODUCT_CODE_PATTERN,
  type KnowledgeTechnicalAttribute,
} from '@voice-agent/contracts';
import { foldKnowledgeText } from './knowledge-query-terms.js';

/**
 * Extração de fatos TÉCNICOS de uma passagem (B2b, DEC-069). Nada do texto é
 * copiado livremente: cada valor é REMONTADO pela plataforma (número + unidade
 * de lista fechada, material de lista, grau IP, rosca). Frases com contexto
 * comercial (preço, desconto, estoque, prazo, pagamento, garantia) não geram
 * fato nenhum. Números técnicos legítimos (16 bar, 4-20 mA, 0,5 %, 24 V) são
 * preservados. Extrair NÃO prova que o documento esteja certo.
 */
export interface ExtractedTechnicalFact {
  readonly attribute: KnowledgeTechnicalAttribute;
  readonly value: string;
}

export const MAX_FACTS_PER_PASSAGE = 8;

const COMMERCIAL =
  /(r\$|us\$|€|\bpreco|\bvalor|\bcust[ao]|desconto|abatimento|promoc|parcel|pagamento|a vista|\bjuros|estoque|\bunidades\b|\bprazo|\bentrega|\bfrete|garantia|dias uteis|\bcupom|\bgratis|gratuit|\bpor cento\b)/;

const NUM = String.raw`-?\d{1,6}(?:[.,]\d{1,4})?`;
const UNIT =
  '(mm²|mm2|°C|ºC|kPa|MPa|bar|psi|mA|Vcc|Vca|Vdc|Vac|VCC|VCA|kW|cv|CV|Hz|rpm|polos|mm|W|V|A|m|%)';
const NUMERIC = new RegExp(
  `(?<![\\p{L}\\p{N}.,])(${NUM})(?:\\s*(?:a|até|-|–|to)\\s*(${NUM}))?\\s?${UNIT}(?![\\p{L}\\p{N}²])`,
  'gu',
);
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  mm2: 'mm²',
  ºC: '°C',
  Vdc: 'Vcc',
  VCC: 'Vcc',
  Vac: 'Vca',
  VCA: 'Vca',
  CV: 'cv',
};

const MATERIALS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\baco inox 316l?\b/, 'aço inox 316'],
  [/\baco inox 304l?\b/, 'aço inox 304'],
  [/\baco carbono\b/, 'aço carbono'],
  [/\bferro fundido\b/, 'ferro fundido'],
  [/\blatao\b/, 'latão'],
  [/\bbronze\b/, 'bronze'],
  [/\baluminio\b/, 'alumínio'],
  [/\bcobre\b/, 'cobre'],
  [/\bpvc\b/, 'PVC'],
  [/\bptfe\b/, 'PTFE'],
  [/\bpolipropileno\b/, 'polipropileno'],
];

const SIMPLE_UNITS: Readonly<Record<string, KnowledgeTechnicalAttribute>> = {
  A: 'CURRENT',
  W: 'POWER',
  kW: 'POWER',
  cv: 'POWER',
  Hz: 'FREQUENCY',
  mm: 'DIMENSION',
  m: 'DIMENSION',
  'mm²': 'CABLE_SECTION',
  polos: 'POLES',
  rpm: 'SPEED',
};

type Picker = (seg: string, range: boolean) => KnowledgeTechnicalAttribute | null;

const isRange = (seg: string, ranged: boolean) => ranged || /\b(faixa|ajuste|range)\b/.test(seg);
const pressure: Picker = (seg, r) => (isRange(seg, r) ? 'PRESSURE_RANGE' : 'PRESSURE');
const voltage: Picker = (seg) => (/\baliment/.test(seg) ? 'SUPPLY_VOLTAGE' : 'VOLTAGE');

/** Unidades com atributo que depende das palavras do MESMO segmento. */
const CONTEXTUAL_UNITS: Readonly<Record<string, Picker>> = {
  bar: pressure,
  psi: pressure,
  kPa: pressure,
  MPa: pressure,
  '°C': (seg, r) => (isRange(seg, r) ? 'TEMPERATURE_RANGE' : 'TEMPERATURE'),
  mA: (seg) => (/\b(saida|sinal)\b/.test(seg) ? 'OUTPUT_SIGNAL' : 'CURRENT'),
  V: voltage,
  Vcc: voltage,
  Vca: voltage,
  // Porcentagem só é técnica com palavra de exatidão; "10% de desconto" nunca vira fato.
  '%': (seg) =>
    /(precis|exatid|incerteza|\berro\b|linearidade|repetibilidade)/.test(seg) ? 'ACCURACY' : null,
};

/** Atributo pela unidade e pelas palavras do segmento (`null` = não é fato técnico). */
function attributeFor(
  unit: string,
  ranged: boolean,
  seg: string,
): KnowledgeTechnicalAttribute | null {
  const pick = CONTEXTUAL_UNITS[unit];
  return pick ? pick(seg, ranged) : (SIMPLE_UNITS[unit] ?? null);
}

function numericFacts(segment: string, folded: string): ExtractedTechnicalFact[] {
  const out: ExtractedTechnicalFact[] = [];
  for (const m of segment.matchAll(NUMERIC)) {
    const unit = UNIT_ALIASES[m[3]!] ?? m[3]!;
    const attribute = attributeFor(unit, m[2] !== undefined, folded);
    if (!attribute) continue;
    out.push({ attribute, value: `${m[1]}${m[2] !== undefined ? ` a ${m[2]}` : ''} ${unit}` });
  }
  return out;
}

function namedFacts(segment: string, folded: string): ExtractedTechnicalFact[] {
  const out: ExtractedTechnicalFact[] = MATERIALS.filter(([re]) => re.test(folded)).map(
    ([, value]) => ({ attribute: 'MATERIAL' as const, value }),
  );
  const ip = /\bIP ?(\d{2})\b/i.exec(segment);
  if (ip) out.push({ attribute: 'PROTECTION_RATING', value: `IP${ip[1]}` });
  const thread = /(\d{1,2}(?:\/\d{1,2})?)\s*(?:"|”|pol(?:egadas?)?\.?)\s*(NPT|BSP)\b/i.exec(
    segment,
  );
  if (thread)
    out.push({ attribute: 'CONNECTION', value: `${thread[1]}" ${thread[2]!.toUpperCase()}` });
  return out;
}

/** Frases (ou células de tabela) → segmentos separados por vírgula seguida de espaço. */
function segmentsOf(text: string): string[][] {
  return text
    .split(/\n+|\t|\||(?<=[.;!?])\s+/)
    .filter((clause) => clause.trim().length > 0)
    .map((clause) => clause.split(/[,;]\s+/));
}

function clauseFacts(clause: readonly string[]): ExtractedTechnicalFact[] {
  if (COMMERCIAL.test(foldKnowledgeText(clause.join(', ')))) return [];
  return clause.flatMap((segment) => {
    const folded = foldKnowledgeText(segment);
    return [...numericFacts(segment, folded), ...namedFacts(segment, folded)];
  });
}

export function extractTechnicalFacts(text: string): ExtractedTechnicalFact[] {
  const facts = new Map<string, ExtractedTechnicalFact>();
  for (const f of segmentsOf(text).flatMap(clauseFacts)) {
    if (isKnowledgeTechnicalValue(f.attribute, f.value)) facts.set(`${f.attribute}|${f.value}`, f);
  }
  return [...facts.values()].slice(0, MAX_FACTS_PER_PASSAGE);
}

const CODE_TOKEN = /(?<![\p{L}\p{N}])([A-Z]{1,4})[-.]?(\d{1,6})([A-Z]?)(?![\p{L}\p{N}])/gu;
const NOT_PRODUCT = new Set(['IP', 'DN', 'PN', 'NBR', 'ISO', 'NR', 'M', 'N']);

/** Código do item na passagem: o código pedido, se presente; senão o primeiro código. */
export function findPassageSubject(text: string, askedCodes: readonly string[]): string | null {
  const found = [...text.matchAll(CODE_TOKEN)]
    .filter((m) => !NOT_PRODUCT.has(m[1]!))
    .map((m) => ({ key: `${m[1]}${m[2]}${m[3]}`.toLowerCase(), code: `${m[1]}-${m[2]}${m[3]}` }))
    .filter((c) => KNOWLEDGE_PRODUCT_CODE_PATTERN.test(c.code));
  const asked = found.find((c) => askedCodes.includes(c.key));
  return (asked ?? found[0])?.code ?? null;
}
