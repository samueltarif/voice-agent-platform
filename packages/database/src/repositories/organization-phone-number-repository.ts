import { and, asc, eq, gt } from 'drizzle-orm';
import {
  parseRegisterPhoneNumberInput,
  type OrganizationPhoneNumber,
  type RegisterOrganizationPhoneNumberInput,
} from './organization-phone-number-types.js';
import type { DatabaseInstance } from '../client/connection.js';
import {
  organizationPhoneNumbers,
  type OrganizationPhoneNumberEntity,
} from '../schema/organization-phone-numbers.js';
import {
  classifyPostgresFailure,
  OutboundPersistenceTechnicalError,
} from './outbound-persistence-errors.js';

export type RegisterPhoneNumberResult =
  | { readonly kind: 'REGISTERED' | 'ALREADY_REGISTERED'; readonly number: OrganizationPhoneNumber }
  /** Número ou SID já pertence a outro registro: não revela o tenant dono. */
  | { readonly kind: 'UNAVAILABLE' };

export type ReleasePhoneNumberResult =
  | { readonly kind: 'RELEASED'; readonly number: OrganizationPhoneNumber }
  | { readonly kind: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'ALREADY_RELEASED' };

const MAX_PAGE_SIZE = 100;

function toPhoneNumber(row: OrganizationPhoneNumberEntity): OrganizationPhoneNumber {
  return { ...row };
}

/**
 * Metadata sintética de números por organização (008-OF2). Não compra,
 * reserva nem consulta números reais em provedores.
 */
export class DrizzleOrganizationPhoneNumberRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async register(input: RegisterOrganizationPhoneNumberInput): Promise<RegisterPhoneNumberResult> {
    const parsed = parseRegisterPhoneNumberInput(input);
    if (!parsed) throw new Error('Invalid phone number registration input.');
    try {
      const [row] = await this.db
        .insert(organizationPhoneNumbers)
        .values({
          organizationId: parsed.organizationId,
          e164Number: parsed.e164Number,
          twilioPhoneNumberSid: parsed.twilioPhoneNumberSid ?? null,
        })
        .returning();
      return { kind: 'REGISTERED', number: toPhoneNumber(row!) };
    } catch (error) {
      if (classifyPostgresFailure(error).kind !== 'UNIQUE_VIOLATION') {
        throw new OutboundPersistenceTechnicalError('registerPhoneNumber', { cause: error });
      }
      return this.resolveRegistrationConflict(parsed);
    }
  }

  async getById(scope: { readonly organizationId: string; readonly phoneNumberId: string }) {
    const [row] = await this.db
      .select()
      .from(organizationPhoneNumbers)
      .where(
        and(
          eq(organizationPhoneNumbers.id, scope.phoneNumberId),
          eq(organizationPhoneNumbers.organizationId, scope.organizationId),
        ),
      );
    return row ? toPhoneNumber(row) : null;
  }

  /** Paginação por cursor (id) com tamanho delimitado. */
  async list(input: {
    readonly organizationId: string;
    readonly limit: number;
    readonly afterId?: string | undefined;
  }): Promise<OrganizationPhoneNumber[]> {
    const scope = eq(organizationPhoneNumbers.organizationId, input.organizationId);
    const rows = await this.db
      .select()
      .from(organizationPhoneNumbers)
      .where(input.afterId ? and(scope, gt(organizationPhoneNumbers.id, input.afterId)) : scope)
      .orderBy(asc(organizationPhoneNumbers.id))
      .limit(Math.max(1, Math.min(input.limit, MAX_PAGE_SIZE)));
    return rows.map(toPhoneNumber);
  }

  /** ACTIVE → RELEASED com CAS (`version`). RELEASED é terminal (trigger). */
  async release(input: {
    readonly organizationId: string;
    readonly phoneNumberId: string;
    readonly expectedVersion: number;
    readonly now: Date;
  }): Promise<ReleasePhoneNumberResult> {
    const [row] = await this.db
      .update(organizationPhoneNumbers)
      .set({
        status: 'RELEASED',
        releasedAt: input.now,
        version: input.expectedVersion + 1,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(organizationPhoneNumbers.id, input.phoneNumberId),
          eq(organizationPhoneNumbers.organizationId, input.organizationId),
          eq(organizationPhoneNumbers.version, input.expectedVersion),
          eq(organizationPhoneNumbers.status, 'ACTIVE'),
        ),
      )
      .returning();
    if (row) return { kind: 'RELEASED', number: toPhoneNumber(row) };
    const current = await this.getById(input);
    if (!current) return { kind: 'NOT_FOUND' };
    return current.status === 'RELEASED'
      ? { kind: 'ALREADY_RELEASED' }
      : { kind: 'VERSION_CONFLICT' };
  }

  private async resolveRegistrationConflict(parsed: {
    readonly organizationId: string;
    readonly e164Number: string;
    readonly twilioPhoneNumberSid?: string | undefined;
  }): Promise<RegisterPhoneNumberResult> {
    const [existing] = await this.db
      .select()
      .from(organizationPhoneNumbers)
      .where(eq(organizationPhoneNumbers.e164Number, parsed.e164Number));
    const sameRegistration =
      existing !== undefined &&
      existing.organizationId === parsed.organizationId &&
      existing.status === 'ACTIVE' &&
      existing.twilioPhoneNumberSid === (parsed.twilioPhoneNumberSid ?? null);
    return sameRegistration
      ? { kind: 'ALREADY_REGISTERED', number: toPhoneNumber(existing) }
      : { kind: 'UNAVAILABLE' };
  }
}
