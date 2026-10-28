import { and, desc, eq } from 'drizzle-orm';
import type { ContactSuppressionReason } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { contactSuppressions, type ContactSuppressionEntity } from '../schema/contacts.js';
import { lockSuppressionKey } from './suppression-linearization-lock.js';

export interface AddSuppressionInput {
  readonly organizationId: string;
  /** Já normalizado (E.164); a normalização acontece na borda HTTP. */
  readonly phoneE164: string;
  readonly reason: ContactSuppressionReason;
  readonly evidenceReference?: string | undefined;
  readonly createdByUserId?: string | undefined;
}

export type AddSuppressionOutcome =
  | { readonly kind: 'SUPPRESSED'; readonly suppression: ContactSuppressionEntity }
  | { readonly kind: 'ALREADY_SUPPRESSED'; readonly suppression: ContactSuppressionEntity };

/**
 * 008-MVP1 — supressões por tenant. Idempotente: registrar novamente o mesmo
 * E.164 preserva o registro ORIGINAL (motivo e evidência não são sobrescritos).
 * Remoção de supressão não é oferecida nesta slice (fail-closed).
 */
export class DrizzleContactSuppressionRepository {
  constructor(private readonly db: DatabaseInstance) {}

  addSuppression(input: AddSuppressionInput): Promise<AddSuppressionOutcome> {
    return this.db.transaction(async (tx) => {
      await lockSuppressionKey(tx, input.organizationId, input.phoneE164);
      const [created] = await tx
        .insert(contactSuppressions)
        .values({
          organizationId: input.organizationId,
          phoneE164: input.phoneE164,
          reason: input.reason,
          evidenceReference: input.evidenceReference ?? null,
          createdByUserId: input.createdByUserId ?? null,
        })
        .onConflictDoNothing({
          target: [contactSuppressions.organizationId, contactSuppressions.phoneE164],
        })
        .returning();
      if (created) return { kind: 'SUPPRESSED' as const, suppression: created };
      const [existing] = await tx
        .select()
        .from(contactSuppressions)
        .where(
          and(
            eq(contactSuppressions.organizationId, input.organizationId),
            eq(contactSuppressions.phoneE164, input.phoneE164),
          ),
        );
      return { kind: 'ALREADY_SUPPRESSED' as const, suppression: existing! };
    });
  }

  listSuppressions(organizationId: string, limit: number, offset: number) {
    return this.db
      .select()
      .from(contactSuppressions)
      .where(eq(contactSuppressions.organizationId, organizationId))
      .orderBy(desc(contactSuppressions.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
