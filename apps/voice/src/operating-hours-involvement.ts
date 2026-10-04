import {
  CANONICAL_OPERATING_HOURS_PHRASES,
  matchesOperatingHoursCapability,
  normalizeOperatingHoursTranscript,
} from './operating-hours-capability-matcher.js';

export interface OperatingHoursInvolvement {
  readonly relevant: boolean;
  readonly exactlyAnswerable: boolean;
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function isWordCharacter(char: string | undefined): boolean {
  return char !== undefined && WORD_CHARACTER.test(char);
}

function containsStandaloneSpan(normalized: string, phrases: ReadonlySet<string>): boolean {
  for (const phrase of phrases) {
    let fromIndex = 0;
    while (fromIndex <= normalized.length - phrase.length) {
      const found = normalized.indexOf(phrase, fromIndex);
      if (found === -1) {
        break;
      }
      const end = found + phrase.length;
      if (!isWordCharacter(normalized[found - 1]) && !isWordCharacter(normalized[end])) {
        return true;
      }
      fromIndex = found + 1;
    }
  }
  return false;
}

export function resolveOperatingHoursInvolvement(
  callerTranscript: string,
): OperatingHoursInvolvement {
  if (matchesOperatingHoursCapability(callerTranscript)) {
    return { relevant: true, exactlyAnswerable: true };
  }
  const normalized = normalizeOperatingHoursTranscript(callerTranscript);
  if (normalized.length === 0) {
    return { relevant: false, exactlyAnswerable: false };
  }
  return {
    relevant: containsStandaloneSpan(normalized, CANONICAL_OPERATING_HOURS_PHRASES),
    exactlyAnswerable: false,
  };
}
