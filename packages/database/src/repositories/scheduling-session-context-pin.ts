import { and, eq } from 'drizzle-orm';
import type { SchedulingCalendarResolution } from '@voice-agent/contracts';
import {
  schedulingSessionContexts,
  type SchedulingSessionContextEntity,
} from '../schema/scheduling-session-contexts.js';
import type { DatabaseInstance } from '../client/connection.js';
import type { DatabaseExecutor } from './database-executor.js';
import { classifyPostgresFailure } from './outbound-persistence-errors.js';
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

/** Pontos observáveis do cálculo (testes determinísticos de concorrência). */
export interface CalendarResolutionHooks {
  readonly afterCampaignLookup?: (() => Promise<void>) | undefined;
  readonly beforePin?: (() => Promise<void>) | undefined;
}

const MAX_PIN_ATTEMPTS = 3;

class PinContention extends Error {}

const retryable = (error: unknown) =>
  error instanceof PinContention ||
  classifyPostgresFailure(error).kind === 'SERIALIZATION_CONFLICT';

/**
 * Uma tentativa, numa transação REPEATABLE READ: todas as prioridades D1 são
 * lidas sobre a MESMA visão (auditoria A4) e só o resultado dessa visão é
 * fixado. Linha já fixada vence; perder a disputa pela PK força nova tentativa.
 */
async function pinOnce(
  db: DatabaseInstance,
  scope: CalendarResolutionScope,
  hooks: CalendarResolutionHooks,
): Promise<SchedulingSessionContextEntity> {
  return db.transaction(
    async (tx) => {
      const existing = await readPinned(tx, scope);
      if (existing) return existing;
      const computed = await computeCalendarResolution(tx, scope, hooks.afterCampaignLookup);
      await hooks.beforePin?.();
      const [inserted] = await tx
        .insert(schedulingSessionContexts)
        .values(toRow(scope, computed))
        .onConflictDoNothing()
        .returning();
      if (!inserted) throw new PinContention('Scheduling context pinned concurrently.');
      return inserted;
    },
    { isolationLevel: 'repeatable read' },
  );
}

async function pinWithRetry(
  db: DatabaseInstance,
  scope: CalendarResolutionScope,
  hooks: CalendarResolutionHooks,
): Promise<SchedulingSessionContextEntity> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await pinOnce(db, scope, hooks);
    } catch (error) {
      if (!retryable(error) || attempt >= MAX_PIN_ATTEMPTS) throw error;
    }
  }
}

/**
 * Resolução fixada da sessão: calculada e gravada só na primeira vez e
 * devolvida SEMPRE a partir da linha vencedora. Agenda fixada que deixou de
 * existir BLOQUEIA, sem trocar a fixação por outra fonte.
 */
export async function pinnedCalendarResolution(
  db: DatabaseInstance,
  scope: CalendarResolutionScope,
  hooks: CalendarResolutionHooks = {},
): Promise<SchedulingCalendarResolution> {
  const row = await pinWithRetry(db, scope, hooks);
  if (row.agentVersionId !== scope.agentVersionId) {
    throw new Error('Pinned scheduling context does not match the session version.');
  }
  const pinned = fromRow(row);
  if (pinned.kind !== 'RESOLVED') return pinned;
  return explicit(db, {
    organizationId: scope.organizationId,
    calendarId: pinned.calendarId,
    source: pinned.source,
  });
}
