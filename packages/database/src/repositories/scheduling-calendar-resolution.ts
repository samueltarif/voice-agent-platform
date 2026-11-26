import { and, eq } from 'drizzle-orm';
import {
  agentSchedulingConfigurationV1Schema,
  type SchedulingCalendarResolution,
  type SchedulingCalendarSource,
} from '@voice-agent/contracts';
import { agentVersions } from '../schema/agents.js';
import { outboundCampaigns } from '../schema/outbound.js';
import { schedulingCalendars } from '../schema/scheduling-calendars.js';
import type { DatabaseExecutor } from './database-executor.js';

/**
 * E2 PR 1 (DEC-075, D1/M1) — agenda da sessão: campanha → versão publicada
 * FIXADA na sessão → padrão explícito da empresa. Só a AUSÊNCIA de
 * configuração cai para a próxima; configuração explícita inválida, excluída
 * ou de outro tenant BLOQUEIA (sem fallback silencioso). A fixação na sessão
 * fica em `scheduling-session-context-pin.ts`.
 */

export interface CalendarResolutionScope {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly campaignId: string | null;
}

type Step = SchedulingCalendarResolution | null;

async function calendarExists(executor: DatabaseExecutor, organizationId: string, id: string) {
  const [row] = await executor
    .select({ id: schedulingCalendars.id })
    .from(schedulingCalendars)
    .where(
      and(eq(schedulingCalendars.id, id), eq(schedulingCalendars.organizationId, organizationId)),
    );
  return Boolean(row);
}

export async function explicit(
  executor: DatabaseExecutor,
  input: { organizationId: string; calendarId: string; source: SchedulingCalendarSource },
): Promise<SchedulingCalendarResolution> {
  return (await calendarExists(executor, input.organizationId, input.calendarId))
    ? { kind: 'RESOLVED', calendarId: input.calendarId, source: input.source }
    : { kind: 'BLOCKED', source: input.source, reason: 'CALENDAR_NOT_FOUND' };
}

async function fromCampaign(
  executor: DatabaseExecutor,
  scope: CalendarResolutionScope,
): Promise<Step> {
  if (!scope.campaignId) return null;
  const [campaign] = await executor
    .select({ calendarId: outboundCampaigns.schedulingCalendarId })
    .from(outboundCampaigns)
    .where(
      and(
        eq(outboundCampaigns.id, scope.campaignId),
        eq(outboundCampaigns.organizationId, scope.organizationId),
      ),
    );
  if (!campaign?.calendarId) return null;
  return explicit(executor, {
    organizationId: scope.organizationId,
    calendarId: campaign.calendarId,
    source: 'CAMPAIGN',
  });
}

/** Só o bloco `scheduling` da versão FIXADA na sessão; ausente = sem configuração. */
async function fromAgentVersion(
  executor: DatabaseExecutor,
  scope: CalendarResolutionScope,
): Promise<Step> {
  const [version] = await executor
    .select({ configuration: agentVersions.configuration })
    .from(agentVersions)
    .where(
      and(
        eq(agentVersions.id, scope.agentVersionId),
        eq(agentVersions.agentId, scope.agentId),
        eq(agentVersions.organizationId, scope.organizationId),
      ),
    );
  const raw = (version?.configuration as Record<string, unknown> | undefined)?.['scheduling'];
  if (raw === undefined) return null;
  const parsed = agentSchedulingConfigurationV1Schema.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'BLOCKED', source: 'AGENT_VERSION', reason: 'AGENT_CONFIGURATION_INVALID' };
  }
  return explicit(executor, {
    organizationId: scope.organizationId,
    calendarId: parsed.data.calendarId,
    source: 'AGENT_VERSION',
  });
}

async function fromOrganizationDefault(
  executor: DatabaseExecutor,
  organizationId: string,
): Promise<Step> {
  const [row] = await executor
    .select({ id: schedulingCalendars.id })
    .from(schedulingCalendars)
    .where(
      and(
        eq(schedulingCalendars.organizationId, organizationId),
        eq(schedulingCalendars.isOrganizationDefault, true),
      ),
    );
  return row ? { kind: 'RESOLVED', calendarId: row.id, source: 'ORGANIZATION_DEFAULT' } : null;
}

export async function computeCalendarResolution(
  executor: DatabaseExecutor,
  scope: CalendarResolutionScope,
  afterCampaignLookup?: () => Promise<void>,
): Promise<SchedulingCalendarResolution> {
  const campaign = await fromCampaign(executor, scope);
  await afterCampaignLookup?.();
  return (
    campaign ??
    (await fromAgentVersion(executor, scope)) ??
    (await fromOrganizationDefault(executor, scope.organizationId)) ?? { kind: 'ABSENT' }
  );
}
