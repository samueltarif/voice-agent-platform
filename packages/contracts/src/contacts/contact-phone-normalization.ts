import { E164_DESTINATION_PATTERN } from '../telephony/e164-destination.js';

/**
 * 008-MVP1 — normalização determinística de telefone de contato para E.164.
 * Regras TÉCNICAS do plano de numeração brasileiro (DDDs geográficos, móvel com
 * 9 dígitos iniciado por 9, fixo com 8 dígitos iniciado por 2–5). Não afirma
 * que o número existe nem que pode ser contatado: elegibilidade regulatória é
 * decidida por supressões e políticas do tenant, nunca presumida aqui.
 */
const BRAZIL_GEOGRAPHIC_AREA_CODES: ReadonlySet<string> = new Set(
  (
    '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 ' +
    '47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 ' +
    '86 87 88 89 91 92 93 94 95 96 97 98 99'
  ).split(' '),
);

export const CONTACT_PHONE_REJECTION_REASONS = [
  'EMPTY',
  'INVALID_CHARACTERS',
  'INVALID_E164',
  'INVALID_AREA_CODE',
  'INVALID_SUBSCRIBER_NUMBER',
  'NON_GEOGRAPHIC_NUMBER',
  'UNSUPPORTED_FORMAT',
] as const;
export type ContactPhoneRejectionReason = (typeof CONTACT_PHONE_REJECTION_REASONS)[number];

export type ContactPhoneKind = 'BR_MOBILE' | 'BR_LANDLINE' | 'INTERNATIONAL';

export type ContactPhoneNormalization =
  | { readonly ok: true; readonly e164: string; readonly kind: ContactPhoneKind }
  | { readonly ok: false; readonly reason: ContactPhoneRejectionReason };

const reject = (reason: ContactPhoneRejectionReason): ContactPhoneNormalization => ({
  ok: false,
  reason,
});

/** `nationalDigits` = DDD (2) + assinante (8 ou 9). */
function normalizeBrazilianNational(nationalDigits: string): ContactPhoneNormalization {
  if (nationalDigits.length !== 10 && nationalDigits.length !== 11) {
    return reject('UNSUPPORTED_FORMAT');
  }
  const areaCode = nationalDigits.slice(0, 2);
  const subscriber = nationalDigits.slice(2);
  if (!BRAZIL_GEOGRAPHIC_AREA_CODES.has(areaCode)) return reject('INVALID_AREA_CODE');
  const e164 = `+55${nationalDigits}`;
  if (subscriber.length === 9 && subscriber.startsWith('9')) {
    return { ok: true, e164, kind: 'BR_MOBILE' };
  }
  if (subscriber.length === 8 && /^[2-5]/.test(subscriber)) {
    return { ok: true, e164, kind: 'BR_LANDLINE' };
  }
  return reject('INVALID_SUBSCRIBER_NUMBER');
}

function normalizeInternational(digits: string): ContactPhoneNormalization {
  if (digits.startsWith('55')) return normalizeBrazilianNational(digits.slice(2));
  const e164 = `+${digits}`;
  return E164_DESTINATION_PATTERN.test(e164)
    ? { ok: true, e164, kind: 'INTERNATIONAL' }
    : reject('INVALID_E164');
}

/**
 * Entrada livre → E.164. Sem `+`, o número é tratado como nacional brasileiro
 * (DDD + assinante, opcionalmente com prefixo de tronco `0`). Códigos de
 * seleção de prestadora e números não geográficos (0800/0300/4004…) são
 * recusados como formato não suportado, nunca adivinhados.
 */
/** Prefixos não geográficos (0300, 0303, 0500, 0800, 0900): nunca destinos de contato. */
const NON_GEOGRAPHIC_PREFIX = /^0(300|303|500|800|900)/;

function normalizeNationalDigits(digits: string): ContactPhoneNormalization {
  if (NON_GEOGRAPHIC_PREFIX.test(digits)) return reject('NON_GEOGRAPHIC_NUMBER');
  if (digits.startsWith('0')) {
    return digits.length === 11 || digits.length === 12
      ? normalizeBrazilianNational(digits.slice(1))
      : reject('UNSUPPORTED_FORMAT');
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return normalizeBrazilianNational(digits.slice(2));
  }
  return normalizeBrazilianNational(digits);
}

export function normalizeContactPhone(raw: string): ContactPhoneNormalization {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return reject('EMPTY');
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return reject('INVALID_CHARACTERS');
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? normalizeInternational(digits) : normalizeNationalDigits(digits);
}
