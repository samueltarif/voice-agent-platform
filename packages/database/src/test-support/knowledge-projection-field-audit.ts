import {
  isKnowledgeTechnicalValue,
  KNOWLEDGE_AGENT_PROJECTION_USAGE,
  KNOWLEDGE_COMMERCIAL_ASPECTS,
  KNOWLEDGE_PRODUCT_CODE_PATTERN,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_TECHNICAL_ATTRIBUTES,
  type KnowledgeTechnicalAttribute,
} from '@voice-agent/contracts';

/**
 * SOMENTE TESTES (revisão da B2b): auditoria INDEPENDENTE do contrato zod de
 * TODOS os campos da projeção do agente — chaves permitidas em cada nível,
 * todo texto validado contra enum, literal, identificador ou gramática, e
 * nenhum texto proibido (marcador, valor do atacante, moeda) em lugar algum.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CITATION = /^[0-9a-f-]{36}:[0-9a-f-]{36}:\d{1,6}$/;
const TERM = /^[a-z0-9]{1,64}$/;
const oneOf = (list: readonly string[]) => (v: string) => list.includes(v);

const TOP: Readonly<Record<string, 'boolean' | 'number' | ((v: string) => boolean) | 'array'>> = {
  trust: oneOf(['UNTRUSTED_DATA']),
  retrievalProfile: oneOf(['v2']),
  found: 'boolean',
  directEvidenceCount: 'number',
  facts: 'array',
  unmatchedTerms: 'array',
  aspectsRequiringAuthorizedSource: 'array',
  withheldUntrusted: 'number',
  withheldCommercialValues: 'number',
  truncated: 'boolean',
  usage: oneOf([KNOWLEDGE_AGENT_PROJECTION_USAGE]),
};

const FACT_KEYS = [
  'citationId',
  'documentId',
  'chunkOrdinal',
  'sourceType',
  'subject',
  'attribute',
  'value',
];

function factViolations(fact: Record<string, unknown>, at: string): string[] {
  const out = Object.keys(fact)
    .filter((k) => !FACT_KEYS.includes(k))
    .map((k) => `${at}.${k}: unexpected field`);
  const check = (ok: boolean, field: string) => (ok ? [] : [`${at}.${field}: invalid`]);
  const attribute = String(fact.attribute) as KnowledgeTechnicalAttribute;
  return [
    ...out,
    ...check(CITATION.test(String(fact.citationId)), 'citationId'),
    ...check(UUID.test(String(fact.documentId)), 'documentId'),
    ...check(Number.isInteger(fact.chunkOrdinal), 'chunkOrdinal'),
    ...check(oneOf(KNOWLEDGE_SOURCE_TYPES)(String(fact.sourceType)), 'sourceType'),
    ...check(
      fact.subject === null || KNOWLEDGE_PRODUCT_CODE_PATTERN.test(String(fact.subject)),
      'subject',
    ),
    ...check(oneOf(KNOWLEDGE_TECHNICAL_ATTRIBUTES)(attribute), 'attribute'),
    ...check(isKnowledgeTechnicalValue(attribute, String(fact.value)), 'value'),
  ];
}

function topViolations(p: Record<string, unknown>): string[] {
  return Object.entries(p).flatMap(([key, value]) => {
    const rule = TOP[key];
    if (!rule) return [`${key}: unexpected field`];
    if (rule === 'array') return Array.isArray(value) ? [] : [`${key}: not an array`];
    if (typeof rule === 'function') return rule(String(value)) ? [] : [`${key}: invalid`];
    return typeof value === rule ? [] : [`${key}: not ${rule}`];
  });
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Lista de violações (vazia = todos os campos dentro das gramáticas). */
export function auditAgentProjectionFields(
  projection: unknown,
  forbidden: readonly string[],
): string[] {
  if (projection === undefined) return [];
  if (typeof projection !== 'object' || projection === null) return ['projection: not an object'];
  const p = projection as Record<string, unknown>;
  const facts = list(p.facts) as Record<string, unknown>[];
  const terms = list(p.unmatchedTerms);
  const aspects = list(p.aspectsRequiringAuthorizedSource);
  const whole = JSON.stringify({ ...p, usage: undefined }).toLowerCase();
  // Valores proibidos só nos campos semânticos (ids/UUIDs têm dígitos soltos).
  const semantic = JSON.stringify([
    facts.map((f) => [f.subject, f.attribute, f.value]),
    terms,
    aspects,
  ]).toLowerCase();
  return [
    ...topViolations(p),
    ...facts.flatMap((f, i) => factViolations(f, `facts[${i}]`)),
    ...terms
      .filter((t) => !TERM.test(String(t)))
      .map((t) => `unmatchedTerms: invalid ${String(t)}`),
    ...aspects
      .filter((a) => !oneOf(KNOWLEDGE_COMMERCIAL_ASPECTS)(String(a)))
      .map(() => 'aspects: invalid'),
    ...forbidden.filter((f) => semantic.includes(f.toLowerCase())).map((f) => `forbidden: ${f}`),
    ...(/r\$|us\$|€|canario/.test(whole) ? ['forbidden: currency or canary'] : []),
  ];
}
