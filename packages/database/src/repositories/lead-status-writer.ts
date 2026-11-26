import { and, eq, sql } from 'drizzle-orm';
import {
  evaluateLeadStatusChange,
  type LeadStatus,
  type LeadStatusChangeBlockReason,
  type LeadStatusChangeOrigin,
} from '@voice-agent/contracts';
import { contacts, contactSuppressions } from '../schema/contacts.js';
import { leadStatusChanges } from '../schema/lead-status-changes.js';
import { leads, type LeadEntity } from '../schema/leads.js';
import type { DatabaseExecutor } from './database-executor.js';
import { insertSchedulingAudit, type SchedulingActor } from './scheduling-audit-entry.js';
import { lockSuppressionKey } from './suppression-linearization-lock.js';

/**
 * E1 (DEC-074) — ÚNICO caminho de escrita do status do lead: valida a
 * transição pela regra pura, incrementa a versão, grava o histórico e a
 * auditoria. O pedido de não receber ligações NÃO passa por aqui sozinho:
 * `recordLeadOptOut` registra primeiro a supressão canônica (auditoria A4).
 */
export async function lockLead(
  executor: DatabaseExecutor,
  organizationId: string,
  leadId: string,
): Promise<LeadEntity | null> {
  const [row] = await executor
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .for('update');
  return row ?? null;
}

export interface LeadStatusChangeCommand {
  readonly lead: LeadEntity;
  readonly to: LeadStatus;
  readonly origin: Exclude<LeadStatusChangeOrigin, 'CREATED'>;
  readonly actor: SchedulingActor;
  readonly reason?: string | undefined;
  readonly meetingId?: string | undefined;
}

export type LeadStatusChangeResult =
  | { readonly kind: 'CHANGED'; readonly lead: LeadEntity }
  | { readonly kind: 'BLOCKED'; readonly reason: LeadStatusChangeBlockReason };

/** Supressão canônica `OPT_OUT` do telefone do lead (idempotente; nunca removida aqui). */
export async function suppressLeadPhone(
  executor: DatabaseExecutor,
  lead: LeadEntity,
  actor: SchedulingActor,
) {
  const [contact] = await executor
    .select({ phoneE164: contacts.phoneE164 })
    .from(contacts)
    .where(and(eq(contacts.id, lead.contactId), eq(contacts.organizationId, lead.organizationId)));
  if (!contact) throw new Error('Lead contact not found inside the tenant.');
  await lockSuppressionKey(executor, lead.organizationId, contact.phoneE164);
  await executor
    .insert(contactSuppressions)
    .values({
      organizationId: lead.organizationId,
      phoneE164: contact.phoneE164,
      reason: 'OPT_OUT',
      evidenceReference: `lead:${lead.id}`,
      createdByUserId: actor.type === 'USER' ? actor.id : null,
    })
    .onConflictDoNothing({
      target: [contactSuppressions.organizationId, contactSuppressions.phoneE164],
    });
}

export async function applyLeadStatusChange(
  executor: DatabaseExecutor,
  command: LeadStatusChangeCommand,
): Promise<LeadStatusChangeResult> {
  const { lead, to, origin, actor } = command;
  const verdict = evaluateLeadStatusChange({ from: lead.status, to, origin });
  if (!verdict.ok) return { kind: 'BLOCKED', reason: verdict.reason };
  const [updated] = await executor
    .update(leads)
    .set({ status: to, statusVersion: sql`${leads.statusVersion} + 1`, updatedAt: new Date() })
    .where(and(eq(leads.id, lead.id), eq(leads.organizationId, lead.organizationId)))
    .returning();
  await executor.insert(leadStatusChanges).values({
    organizationId: lead.organizationId,
    leadId: lead.id,
    fromStatus: lead.status,
    toStatus: to,
    origin,
    actorType: actor.type,
    actorId: actor.id,
    reason: command.reason ?? null,
    meetingId: command.meetingId ?? null,
  });
  await insertSchedulingAudit(executor, {
    organizationId: lead.organizationId,
    actor,
    action: 'lead.status_changed',
    targetType: 'lead',
    targetId: lead.id,
    metadata: { from: lead.status, to, origin, meetingId: command.meetingId ?? null },
  });
  return { kind: 'CHANGED', lead: updated! };
}
