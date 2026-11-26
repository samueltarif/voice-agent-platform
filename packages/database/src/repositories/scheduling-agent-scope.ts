import { and, eq } from 'drizzle-orm';
import type {
  SchedulingAgentScope,
  SchedulingRefusal,
  SchedulingSessionContextPort,
} from '@voice-agent/contracts';
import { schedulingCalendars } from '../schema/scheduling-calendars.js';
import {
  schedulingProtocolStates,
  type SchedulingProtocolStateEntity,
} from '../schema/scheduling-protocol-states.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { SchedulingBinding, LockedProtocol } from './scheduling-protocol-store.js';

/**
 * E2 PR 2 (DEC-075) — escopo do agente derivado SÓ do servidor: a concessão
 * dá tenant, sessão, agente, versão e a agenda da versão (valor); o
 * resolvedor da PR 1 deriva tentativa, job, destino, lead e agenda fixada.
 * Leitura pontual (sem trava): os efeitos revalidam sob a trava S.
 */

export type ResolvedAgentScope =
  | { readonly ok: false; readonly refusal: SchedulingRefusal }
  | {
      readonly ok: true;
      readonly binding: SchedulingBinding;
      /** Presente só quando o agendamento está disponível (sessão ativa, lead e agenda). */
      readonly scheduling: { readonly leadId: string; readonly calendarId: string } | null;
      readonly unavailable: SchedulingRefusal | null;
    };

export async function resolveAgentScope(
  resolver: SchedulingSessionContextPort,
  scope: SchedulingAgentScope,
): Promise<ResolvedAgentScope> {
  const context = await resolver.resolve(scope);
  if (context.kind !== 'BOUND') return { ok: false, refusal: 'CONTEXT_REFUSED' };
  const pinned = context.calendar;
  // M2: agenda vinda da versão tem de ser a capturada na concessão.
  if (
    pinned.kind === 'RESOLVED' &&
    pinned.source === 'AGENT_VERSION' &&
    pinned.calendarId !== scope.grantCalendarId
  ) {
    return { ok: false, refusal: 'CONTEXT_REFUSED' };
  }
  const { binding } = context;
  const base = {
    organizationId: binding.organizationId,
    sessionId: binding.sessionId,
    attemptId: binding.attemptId,
    agentId: binding.agentId,
    agentVersionId: binding.agentVersionId,
  };
  const capability = context.scheduling;
  if (capability.kind === 'AVAILABLE') {
    const scheduling = { leadId: capability.leadId, calendarId: capability.calendarId };
    return { ok: true, binding: base, scheduling, unavailable: null };
  }
  const unavailable =
    capability.reason === 'SESSION_NOT_ACTIVE' ? 'SESSION_NOT_ACTIVE' : 'SCHEDULING_UNAVAILABLE';
  return { ok: true, binding: base, scheduling: null, unavailable };
}

/** Bloqueios do avanço comercial a partir do estado travado (ordem de precedência). */
export function commercialBlock(locked: LockedProtocol): SchedulingRefusal | null {
  const phase = locked.row.state.phase;
  if (!locked.active || phase === 'CLOSED') return 'SESSION_NOT_ACTIVE';
  if (phase === 'OPTED_OUT') return 'OPT_OUT_REQUESTED';
  if (locked.row.optOutPending) return 'OPT_OUT_CLARIFICATION_PENDING';
  if (phase === 'BOOKED') return 'ALREADY_BOOKED';
  return phase === 'BOOKING' ? 'BOOKING_IN_FLIGHT' : null;
}

export async function calendarTimezone(
  executor: DatabaseExecutor,
  scope: { readonly organizationId: string; readonly calendarId: string },
): Promise<string | null> {
  const [row] = await executor
    .select({ timezone: schedulingCalendars.timezone })
    .from(schedulingCalendars)
    .where(
      and(
        eq(schedulingCalendars.id, scope.calendarId),
        eq(schedulingCalendars.organizationId, scope.organizationId),
      ),
    );
  return row?.timezone ?? null;
}

/** Leitura sem trava (diagnóstico e reconciliação depois do commit). */
export async function readProtocolRow(
  executor: DatabaseExecutor,
  scope: { readonly organizationId: string; readonly sessionId: string },
): Promise<SchedulingProtocolStateEntity | null> {
  const [row] = await executor
    .select()
    .from(schedulingProtocolStates)
    .where(
      and(
        eq(schedulingProtocolStates.organizationId, scope.organizationId),
        eq(schedulingProtocolStates.sessionId, scope.sessionId),
      ),
    );
  return row ?? null;
}
