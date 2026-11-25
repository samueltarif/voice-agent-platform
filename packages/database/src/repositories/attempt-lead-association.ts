import { and, eq } from 'drizzle-orm';
import { callAttempts } from '../schema/call-attempts.js';
import { contacts, contactSuppressions } from '../schema/contacts.js';
import { leads } from '../schema/leads.js';
import { outboundCallJobs } from '../schema/outbound.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockSuppressionKey } from './suppression-linearization-lock.js';

/**
 * E1 (auditoria A3/A4) — fatos resolvidos NO SERVIDOR a partir do registro
 * durável, nunca de identificadores enviados por um modelo ou fornecedor.
 */
export async function findLeadPhone(
  executor: DatabaseExecutor,
  organizationId: string,
  leadId: string,
): Promise<string | null> {
  const [row] = await executor
    .select({ phoneE164: contacts.phoneE164 })
    .from(leads)
    .innerJoin(
      contacts,
      and(eq(contacts.id, leads.contactId), eq(contacts.organizationId, leads.organizationId)),
    )
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)));
  return row?.phoneE164 ?? null;
}

export type AttemptLeadAssociation = 'MATCH' | 'ATTEMPT_NOT_FOUND' | 'ATTEMPT_LEAD_MISMATCH';

/**
 * A tentativa só pode gerar oferta ou reserva para o lead cujo telefone ela
 * efetivamente discou (destino do job durável, no mesmo tenant).
 */
export async function verifyAttemptDialsLead(
  executor: DatabaseExecutor,
  input: { readonly organizationId: string; readonly attemptId: string; readonly leadId: string },
): Promise<AttemptLeadAssociation> {
  const [attempt] = await executor
    .select({ destination: outboundCallJobs.destinationPhone })
    .from(callAttempts)
    .innerJoin(
      outboundCallJobs,
      and(
        eq(outboundCallJobs.id, callAttempts.jobId),
        eq(outboundCallJobs.organizationId, callAttempts.organizationId),
      ),
    )
    .where(
      and(
        eq(callAttempts.id, input.attemptId),
        eq(callAttempts.organizationId, input.organizationId),
      ),
    );
  if (!attempt) return 'ATTEMPT_NOT_FOUND';
  const leadPhone = await findLeadPhone(executor, input.organizationId, input.leadId);
  return leadPhone !== null && leadPhone === attempt.destination
    ? 'MATCH'
    : 'ATTEMPT_LEAD_MISMATCH';
}

/**
 * Supressão CANÔNICA do telefone do lead (qualquer origem: lead, API de
 * supressões, cadastro externo). Linearizada com o registro de supressão.
 */
export async function isLeadPhoneSuppressed(
  executor: DatabaseExecutor,
  organizationId: string,
  leadId: string,
): Promise<boolean> {
  const phone = await findLeadPhone(executor, organizationId, leadId);
  if (phone === null) return false;
  await lockSuppressionKey(executor, organizationId, phone);
  const [hit] = await executor
    .select({ id: contactSuppressions.id })
    .from(contactSuppressions)
    .where(
      and(
        eq(contactSuppressions.organizationId, organizationId),
        eq(contactSuppressions.phoneE164, phone),
      ),
    )
    .limit(1);
  return hit !== undefined;
}
