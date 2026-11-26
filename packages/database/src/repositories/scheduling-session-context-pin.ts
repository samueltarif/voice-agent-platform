import { and, eq } from 'drizzle-orm';
import type { SchedulingCalendarResolution } from '@voice-agent/contracts';
import {
  schedulingSessionContexts,
  type SchedulingSessionContextEntity,
} from '../schema/scheduling-session-contexts.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  computeCalendarResolution,
  explicit,
  type CalendarResolutionScope,
} from './scheduling-calendar-resolution.js';

/** E2 PR 1 (DEC-075, M1) — fixação da resolução de agenda na sessão. */

function toRow(scope: CalendarResolutionScope, resolution: SchedulingCalendarResolution) {
  return {
    organizationId: scope.organizationId,
    sessionId: scope.sessionId,
    agentVersionId: scope.agentVersionId,
    resolution: resolution.kind,
    calendarId: resolution.kind === 'RESOLVED' ? resolution.calendarId : null,
    calendarSource: resolution.kind === 'ABSENT' ? null : resolution.source,
    blockedReason: resolution.kind === 'BLOCKED' ? resolution.reason : null,
  };
}

function fromRow(row: SchedulingSessionContextEntity): SchedulingCalendarResolution {
  if (row.resolution === 'RESOLVED') {
    return { kind: 'RESOLVED', calendarId: row.calendarId!, source: row.calendarSource! };
  }
  if (row.resolution === 'BLOCKED') {
    const reason = row.blockedReason as 'CALENDAR_NOT_FOUND' | 'AGENT_CONFIGURATION_INVALID';
    return { kind: 'BLOCKED', source: row.calendarSource!, reason };
  }
  return { kind: 'ABSENT' };
}

async function readPinned(executor: DatabaseExecutor, scope: CalendarResolutionScope) {
  const [row] = await executor
    .select()
    .from(schedulingSessionContexts)
    .where(
      and(
        eq(schedulingSessionContexts.organizationId, scope.organizationId),
        eq(schedulingSessionContexts.sessionId, scope.sessionId),
      ),
    );
  return row ?? null;
}

/**
 * Resolução fixada da sessão: calculada e gravada só na primeira vez (corrida
 * entre resoluções concorrentes decidida pela PK) e devolvida SEMPRE a partir
 * da linha gravada. Agenda fixada que deixou de existir BLOQUEIA, sem trocar
 * a fixação por outra fonte.
 */
export async function pinnedCalendarResolution(
  executor: DatabaseExecutor,
  scope: CalendarResolutionScope,
): Promise<SchedulingCalendarResolution> {
  let row = await readPinned(executor, scope);
  if (!row) {
    const computed = await computeCalendarResolution(executor, scope);
    await executor
      .insert(schedulingSessionContexts)
      .values(toRow(scope, computed))
      .onConflictDoNothing();
    row = await readPinned(executor, scope);
  }
  if (!row || row.agentVersionId !== scope.agentVersionId) {
    throw new Error('Pinned scheduling context does not match the session version.');
  }
  const pinned = fromRow(row);
  if (pinned.kind !== 'RESOLVED') return pinned;
  return explicit(executor, {
    organizationId: scope.organizationId,
    calendarId: pinned.calendarId,
    source: pinned.source,
  });
}
