import { and, eq } from 'drizzle-orm';
import { contacts, contactSuppressions } from '../schema/contacts.js';
import { leadStatusChanges } from '../schema/lead-status-changes.js';
import { leads, type LeadEntity } from '../schema/leads.js';
import type { DatabaseExecutor } from './database-executor.js';
import { insertSchedulingAudit, type SchedulingActor } from './scheduling-audit-entry.js';

/** E1 (DEC-074) — peças de leitura e criação usadas por `DrizzleLeadRepository`. */
/** Colunas da visão do lead: dados do contato sem duplicação + supressão ativa. */
export const LEAD_VIEW_COLUMNS = {
  lead: leads,
  displayName: contacts.displayName,
  phoneE164: contacts.phoneE164,
  phoneSuppressed: contactSuppressions.id,
};

export function toLeadView(row: {
  lead: LeadEntity;
  displayName: string | null;
  phoneE164: string;
  phoneSuppressed: string | null;
}) {
  return {
    ...row.lead,
    displayName: row.displayName,
    phoneE164: row.phoneE164,
    phoneSuppressed: row.phoneSuppressed !== null,
  };
}

export async function isPhoneSuppressed(
  executor: DatabaseExecutor,
  organizationId: string,
  phoneE164: string,
) {
  const [hit] = await executor
    .select({ id: contactSuppressions.id })
    .from(contactSuppressions)
    .where(
      and(
        eq(contactSuppressions.organizationId, organizationId),
        eq(contactSuppressions.phoneE164, phoneE164),
      ),
    )
    .limit(1);
  return hit !== undefined;
}

export async function recordLeadCreation(
  executor: DatabaseExecutor,
  lead: LeadEntity,
  actor: SchedulingActor,
) {
  await executor.insert(leadStatusChanges).values({
    organizationId: lead.organizationId,
    leadId: lead.id,
    fromStatus: null,
    toStatus: lead.status,
    origin: 'CREATED',
    actorType: actor.type,
    actorId: actor.id,
  });
  await insertSchedulingAudit(executor, {
    organizationId: lead.organizationId,
    actor,
    action: 'lead.created',
    targetType: 'lead',
    targetId: lead.id,
    metadata: { contactId: lead.contactId, status: lead.status },
  });
}
