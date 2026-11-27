import { and, eq } from 'drizzle-orm';
import type { SchedulingAgentScope } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import type { PostCallAttempt } from '../repositories/post-call-record.js';
import type { DrizzleSchedulingAgentService } from '../repositories/scheduling-agent-service.js';
import { callAttempts } from '../schema/call-attempts.js';
import {
  createPublishedAgent,
  type DurableOutboundFixture,
  type TenantFixture,
} from './durable-outbound-fixtures.js';
import { createSyntheticLead, createWeekdayCalendar } from './scheduling-fixtures.js';
import {
  createBoundCallSession,
  setCampaignSchedulingCalendar,
} from './scheduling-session-fixtures.js';

/**
 * E2 (DEC-075/DEC-077) — harness OFFLINE do agendamento pelo agente: sessão
 * durável real, lead do destino, agenda fixada pela campanha (D1) e os
 * serviços canônicos. Simula só o que o motor conversacional faria (chamar
 * ferramentas) e o relatório pós-chamada; nenhuma chamada real, nenhum modelo.
 */

export interface AgentScenario {
  readonly tenant: TenantFixture;
  readonly scope: SchedulingAgentScope;
  readonly sessionId: string;
  readonly attemptId: string;
  readonly leadId: string;
  readonly phone: string;
  readonly calendarId: string | null;
}

export async function createAgentScenario(
  db: DatabaseInstance,
  input: {
    readonly fx: DurableOutboundFixture;
    readonly tenant?: TenantFixture;
    readonly calendarId?: string | null;
  },
): Promise<AgentScenario> {
  const base = input.tenant ?? input.fx.tenantA;
  const agent = await createPublishedAgent(db, base.organizationId, input.fx.userId);
  const tenant: TenantFixture = { ...base, ...agent };
  const { lead, contact } = await createSyntheticLead(db, base.organizationId);
  const calendarId =
    input.calendarId === undefined
      ? (await createWeekdayCalendar(db, { organizationId: base.organizationId })).id
      : input.calendarId;
  const session = await createBoundCallSession(db, { tenant, destinationPhone: contact.phoneE164 });
  if (calendarId && session.campaignId) {
    await setCampaignSchedulingCalendar(db, {
      organizationId: base.organizationId,
      campaignId: session.campaignId,
      calendarId,
    });
  }
  return {
    tenant,
    scope: {
      organizationId: base.organizationId,
      sessionId: session.sessionId,
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
      grantCalendarId: null,
    },
    sessionId: session.sessionId,
    attemptId: session.attemptId,
    leadId: lead.id,
    phone: contact.phoneE164,
    calendarId,
  };
}

/** Lista ofertada + pedido da opção (o que o motor conversacional faria com as ferramentas). */
export async function offerAndRequest(
  service: DrizzleSchedulingAgentService,
  scope: SchedulingAgentScope,
  input: { readonly option?: number; readonly phrase?: string } = {},
): Promise<{ readonly listRevision: number; readonly option: number; readonly label: string }> {
  const found = await service.findSlots(scope, {});
  if (found.status !== 'OFFERED') throw new Error(`expected OFFERED, got ${found.status}`);
  const option = input.option ?? 1;
  const requested = await service.requestBooking(scope, {
    listRevision: found.listRevision,
    option,
    leadConfirmation: input.phrase ?? 'Sim, pode marcar.',
  });
  if (requested.status !== 'PENDING_CONFIRMATION') {
    throw new Error(`expected PENDING_CONFIRMATION, got ${requested.status}`);
  }
  const label = found.options[option - 1]!.label;
  return { listRevision: found.listRevision, option, label };
}

/** Tentativa do cenário no formato que o pipeline de webhook entrega (resolvida no servidor). */
export async function postCallAttemptOf(
  db: DatabaseInstance,
  scenario: AgentScenario,
): Promise<PostCallAttempt> {
  const [row] = await db
    .select({ jobId: callAttempts.jobId })
    .from(callAttempts)
    .where(
      and(
        eq(callAttempts.id, scenario.attemptId),
        eq(callAttempts.organizationId, scenario.tenant.organizationId),
      ),
    );
  return {
    organizationId: scenario.tenant.organizationId,
    attemptId: scenario.attemptId,
    jobId: row!.jobId,
    callSessionId: scenario.sessionId,
    agentId: scenario.tenant.agentId,
    agentVersionId: scenario.tenant.agentVersionId,
  };
}

export {
  leadStatusOf,
  leadStatusOrigins,
  meetingsOfLead,
  offersOfLead,
  protocolPhase,
  intentsOf,
  reconciliationOf,
  suppressionsOf,
  postCallReport,
} from './scheduling-agent-queries.js';
