import { e164DestinationSchema } from '@voice-agent/contracts';

/**
 * Número gerenciado pela operadora (Twilio, DEC-042) associado a UMA organização.
 * ACTIVE   número vinculado à organização (metadata apenas).
 * RELEASED desvinculado; terminal. A mesma identidade E.164 não é reatribuída a
 *          outro tenant sem nova decisão humana (unicidade global).
 * `twilioPhoneNumberSid` é metadata persistida e NÃO verificada perante o provedor.
 */
export const ORGANIZATION_PHONE_NUMBER_STATUSES = ['ACTIVE', 'RELEASED'] as const;
export type OrganizationPhoneNumberStatus = (typeof ORGANIZATION_PHONE_NUMBER_STATUSES)[number];

export interface OrganizationPhoneNumber {
  readonly id: string;
  readonly organizationId: string;
  readonly e164Number: string;
  readonly twilioPhoneNumberSid: string | null;
  readonly status: OrganizationPhoneNumberStatus;
  readonly version: number;
  readonly releasedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RegisterOrganizationPhoneNumberInput {
  readonly organizationId: string;
  readonly e164Number: string;
  readonly twilioPhoneNumberSid?: string | undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_KEYS = new Set(['organizationId', 'e164Number', 'twilioPhoneNumberSid']);

/** Validação estrita (sem campos extras) reutilizando o tipo E.164 dos contratos. */
export function parseRegisterPhoneNumberInput(
  input: RegisterOrganizationPhoneNumberInput,
): RegisterOrganizationPhoneNumberInput | null {
  const keysOk = Object.keys(input).every((key) => ALLOWED_KEYS.has(key));
  const sid = input.twilioPhoneNumberSid?.trim();
  const sidOk = sid === undefined || (sid.length > 0 && sid.length <= 64);
  const valid =
    keysOk &&
    sidOk &&
    UUID_PATTERN.test(input.organizationId) &&
    e164DestinationSchema.safeParse(input.e164Number).success;
  if (!valid) return null;
  return {
    organizationId: input.organizationId,
    e164Number: input.e164Number,
    twilioPhoneNumberSid: sid,
  };
}
