import { and, count, eq } from 'drizzle-orm';
import type { SchedulingAgentScope } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { readProtocolRow } from '../repositories/scheduling-agent-scope.js';
import { leadStatusChanges } from '../schema/lead-status-changes.js';
import { leads } from '../schema/leads.js';
import { meetingSlotOffers } from '../schema/meeting-slot-offers.js';
import { meetings } from '../schema/meetings.js';

/** E2 PR 2/3 — consultas de verificação dos testes offline do agendamento pelo agente. */

export async function meetingsOfLead(db: DatabaseInstance, organizationId: string, leadId: string) {
  return db
    .select()
    .from(meetings)
    .where(and(eq(meetings.organizationId, organizationId), eq(meetings.leadId, leadId)));
}

export async function offersOfLead(db: DatabaseInstance, organizationId: string, leadId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(meetingSlotOffers)
    .where(
      and(
        eq(meetingSlotOffers.organizationId, organizationId),
        eq(meetingSlotOffers.leadId, leadId),
      ),
    );
  return row?.n ?? 0;
}

export async function protocolPhase(db: DatabaseInstance, scope: SchedulingAgentScope) {
  return (await readProtocolRow(db, scope))?.state.phase ?? null;
}

/** Status atual do lead e as origens do histórico (E2 PR 3, consultas de teste). */
export async function leadStatusOf(db: DatabaseInstance, organizationId: string, leadId: string) {
  const [row] = await db
    .select({ status: leads.status })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)));
  return row?.status ?? null;
}

export async function leadStatusOrigins(
  db: DatabaseInstance,
  organizationId: string,
  leadId: string,
) {
  return db
    .select({ origin: leadStatusChanges.origin, to: leadStatusChanges.toStatus })
    .from(leadStatusChanges)
    .where(
      and(
        eq(leadStatusChanges.leadId, leadId),
        eq(leadStatusChanges.organizationId, organizationId),
      ),
    );
}
