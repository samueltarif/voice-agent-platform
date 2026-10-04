/**
 * Pure deterministic capability matcher for operating hours queries.
 *
 * Implements an allowlist-style exact match over normalized transcripts.
 * Rejects all ambiguous, out-of-scope, appointment, delivery, or holiday questions fail-closed.
 */

export const CANONICAL_OPERATING_HOURS_PHRASES: ReadonlySet<string> = new Set([
  'qual e o horario de atendimento',
  'qual o horario de atendimento',
  'qual e o horario de funcionamento',
  'qual o horario de funcionamento',
  'qual e o seu horario de atendimento',
  'qual o seu horario de atendimento',
  'qual e o seu horario de funcionamento',
  'qual o seu horario de funcionamento',
  'qual e o horario de atendimento de voces',
  'qual o horario de atendimento de voces',
  'qual e o horario de funcionamento de voces',
  'qual o horario de funcionamento de voces',
  'ate que horas voces atendem',
  'ate que horas voce atende',
  'ate que horas fica aberto',
  'que horas voces abrem',
  'que horas voce abre',
  'que horas abre',
  'que horas voces fecham',
  'que horas voce fecha',
  'que horas fecha',
  'horario de atendimento',
  'horario de funcionamento',
]);

/**
 * Normalizes input transcript for deterministic matching.
 * - trims and lowers case
 * - strips diacritics (accents)
 * - converts punctuation to whitespace
 * - collapses multiple spaces
 */
export function normalizeOperatingHoursTranscript(raw: string): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if the transcript matches a canonical operating hours query.
 * Fail-closed by default for any unknown, fuzzy, or ambiguous phrase.
 */
export function matchesOperatingHoursCapability(callerTranscript: string): boolean {
  const normalized = normalizeOperatingHoursTranscript(callerTranscript);
  if (normalized.length === 0) {
    return false;
  }
  return CANONICAL_OPERATING_HOURS_PHRASES.has(normalized);
}
