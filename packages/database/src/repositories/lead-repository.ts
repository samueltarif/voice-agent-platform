import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import {
  initialLeadStatus,
  type LeadStatus,
  type LeadStatusChangeBlockReason,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { contacts, contactSuppressions } from '../schema/contacts.js';
import { leadStatusChanges } from '../schema/lead-status-changes.js';
import { leads, type LeadEntity } from '../schema/leads.js';
import type { DatabaseExecutor } from './database-executor.js';
import { recordLeadOptOut, type LeadOptOutResult } from './lead-opt-out.js';
import { applyLeadStatusChange, lockLead } from './lead-status-writer.js';
import type { SchedulingActor } from './scheduling-audit-entry.js';
import {
  isPhoneSuppressed,
  LEAD_VIEW_COLUMNS,
  recordLeadCreation,
  toLeadView,
} from './lead-records.js';
import { lockSuppressionKey } from './suppression-linearization-lock.js';

export type CreateLeadOutcome =
  | { readonly kind: 'CREATED' | 'EXISTING'; readonly lead: LeadEntity }
  | { readonly kind: 'CONTACT_NOT_FOUND' };

export type ChangeLeadStatusOutcome =
  | LeadOptOutResult
  | { readonly kind: 'NOT_FOUND' | 'VERSION_CONFLICT' }
  | { readonly kind: 'BLOCKED'; readonly reason: LeadStatusChangeBlockReason };

export interface ChangeLeadStatusInput {
  readonly organizationId: string;
  readonly leadId: string;
  readonly status: LeadStatus;
  readonly expectedVersion: number;
  readonly actor: SchedulingActor;
  readonly reason?: string | undefined;
}

/**
 * E1 (DEC-074) — leads ligados aos contatos existentes (um por contato).
 * Toda leitura e escrita é restrita à organização; `phoneSuppressed` mostra
 * supressões registradas por outros caminhos (API de supressão, 008-MVP1).
 */
export class DrizzleLeadRepository {
  constructor(private readonly db: DatabaseInstance) {}

  createLeadForContact(input: {
    readonly organizationId: string;
    readonly contactId: string;
    readonly actor: SchedulingActor;
  }): Promise<CreateLeadOutcome> {
    return this.db.transaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.id, input.contactId), eq(contacts.organizationId, input.organizationId)),
        )
        .for('share');
      if (!contact) return { kind: 'CONTACT_NOT_FOUND' as const };
      await lockSuppressionKey(tx, input.organizationId, contact.phoneE164);
      const suppressed = await isPhoneSuppressed(tx, input.organizationId, contact.phoneE164);
      const [created] = await tx
        .insert(leads)
        .values({
          organizationId: input.organizationId,
          contactId: contact.id,
          status: initialLeadStatus(suppressed),
        })
        .onConflictDoNothing({ target: [leads.organizationId, leads.contactId] })
        .returning();
      if (!created) return { kind: 'EXISTING' as const, lead: await this.findByContact(tx, input) };
      await recordLeadCreation(tx, created, input.actor);
      return { kind: 'CREATED' as const, lead: created };
    });
  }

  /** `DO_NOT_CALL` no painel é opt-out: supressão canônica, sem exigir a versão atual. */
  changeLeadStatus(input: ChangeLeadStatusInput): Promise<ChangeLeadStatusOutcome> {
    return this.db.transaction(async (tx) => {
      const lead = await lockLead(tx, input.organizationId, input.leadId);
      if (!lead) return { kind: 'NOT_FOUND' as const };
      // Opt-out explícito NUNCA se perde por versão comercial desatualizada
      // (2ª auditoria, A4): a versão protege só as demais mudanças comerciais.
      if (input.status === 'DO_NOT_CALL') return recordLeadOptOut(tx, { ...input, lead });
      if (lead.statusVersion !== input.expectedVersion)
        return { kind: 'VERSION_CONFLICT' as const };
      return applyLeadStatusChange(tx, {
        lead,
        to: input.status,
        origin: 'MANUAL',
        actor: input.actor,
        reason: input.reason,
      });
    });
  }

  /** Opt-out sem controle de versão (ex.: pedido do contato): nunca se perde. */
  recordOptOut(input: {
    readonly organizationId: string;
    readonly leadId: string;
    readonly actor: SchedulingActor;
    readonly reason?: string | undefined;
  }): Promise<LeadOptOutResult | { readonly kind: 'NOT_FOUND' }> {
    return this.db.transaction(async (tx) => {
      const lead = await lockLead(tx, input.organizationId, input.leadId);
      if (!lead) return { kind: 'NOT_FOUND' as const };
      return recordLeadOptOut(tx, { ...input, lead });
    });
  }

  async getLead(organizationId: string, leadId: string) {
    const [row] = await this.selectView(
      eq(leads.id, leadId),
      eq(leads.organizationId, organizationId),
    );
    if (!row) return null;
    const history = await this.db
      .select()
      .from(leadStatusChanges)
      .where(
        and(
          eq(leadStatusChanges.leadId, leadId),
          eq(leadStatusChanges.organizationId, organizationId),
        ),
      )
      .orderBy(asc(leadStatusChanges.createdAt));
    return { ...toLeadView(row), history };
  }

  async listLeads(input: {
    readonly organizationId: string;
    readonly status?: LeadStatus | undefined;
    readonly limit: number;
    readonly offset: number;
  }) {
    const filters = [eq(leads.organizationId, input.organizationId)];
    if (input.status) filters.push(eq(leads.status, input.status));
    const rows = await this.selectView(...filters)
      .orderBy(desc(leads.updatedAt), asc(leads.id))
      .limit(input.limit)
      .offset(input.offset);
    return rows.map(toLeadView);
  }

  private selectView(...filters: SQL[]) {
    return this.db
      .select(LEAD_VIEW_COLUMNS)
      .from(leads)
      .innerJoin(
        contacts,
        and(eq(contacts.id, leads.contactId), eq(contacts.organizationId, leads.organizationId)),
      )
      .leftJoin(
        contactSuppressions,
        and(
          eq(contactSuppressions.organizationId, leads.organizationId),
          eq(contactSuppressions.phoneE164, contacts.phoneE164),
        ),
      )
      .where(and(...filters))
      .$dynamic();
  }

  private async findByContact(
    executor: DatabaseExecutor,
    input: { organizationId: string; contactId: string },
  ) {
    const [row] = await executor
      .select()
      .from(leads)
      .where(
        and(eq(leads.organizationId, input.organizationId), eq(leads.contactId, input.contactId)),
      );
    return row!;
  }
}
