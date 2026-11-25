import { and, asc, eq, sql } from 'drizzle-orm';
import type { SchedulingPolicy } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import {
  schedulingCalendars,
  type SchedulingCalendarEntity,
} from '../schema/scheduling-calendars.js';
import type { DatabaseExecutor } from './database-executor.js';
import { classifyPostgresFailure } from './outbound-persistence-errors.js';
import { insertSchedulingAudit, type SchedulingActor } from './scheduling-audit-entry.js';
import { findCalendarRow, loadCalendarSnapshot } from './scheduling-calendar-snapshot.js';

export type CalendarVersionedOutcome =
  | { readonly kind: 'UPDATED'; readonly calendar: SchedulingCalendarEntity }
  | { readonly kind: 'NOT_FOUND' | 'VERSION_CONFLICT' };

export interface CalendarVersionedCommand {
  readonly organizationId: string;
  readonly calendarId: string;
  readonly expectedVersion: number;
  readonly actor: SchedulingActor;
}

/**
 * E1 (DEC-074) — trava a agenda, confere a versão esperada, executa a mudança
 * e incrementa a versão, com auditoria na mesma transação.
 */
export async function updateCalendarVersioned(
  executor: DatabaseExecutor,
  command: CalendarVersionedCommand & { readonly action: string },
  mutate: (row: SchedulingCalendarEntity) => Promise<Partial<SchedulingCalendarEntity>>,
): Promise<CalendarVersionedOutcome> {
  const row = await findCalendarRow(executor, { ...command, lock: true });
  if (!row) return { kind: 'NOT_FOUND' };
  if (row.version !== command.expectedVersion) return { kind: 'VERSION_CONFLICT' };
  const changes = await mutate(row);
  const [calendar] = await executor
    .update(schedulingCalendars)
    .set({ ...changes, version: sql`${schedulingCalendars.version} + 1`, updatedAt: new Date() })
    .where(eq(schedulingCalendars.id, row.id))
    .returning();
  await insertSchedulingAudit(executor, {
    organizationId: command.organizationId,
    actor: command.actor,
    action: command.action,
    targetType: 'scheduling_calendar',
    targetId: row.id,
    metadata: { version: calendar!.version },
  });
  return { kind: 'UPDATED', calendar: calendar! };
}

/** E1 (DEC-074) — agendas por organização (criação, leitura, política). */
export class DrizzleSchedulingCalendarRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async createCalendar(input: {
    readonly organizationId: string;
    readonly name: string;
    readonly policy: SchedulingPolicy;
    readonly actor: SchedulingActor;
  }) {
    try {
      return await this.db.transaction(async (tx) => {
        const [calendar] = await tx
          .insert(schedulingCalendars)
          .values({ organizationId: input.organizationId, name: input.name, ...input.policy })
          .returning();
        await insertSchedulingAudit(tx, {
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'scheduling_calendar.created',
          targetType: 'scheduling_calendar',
          targetId: calendar!.id,
          metadata: { timezone: calendar!.timezone },
        });
        return { kind: 'CREATED' as const, calendar: calendar! };
      });
    } catch (error) {
      const failure = classifyPostgresFailure(error);
      if (failure.constraint === 'scheduling_calendars_org_name_unique') {
        return { kind: 'NAME_TAKEN' as const };
      }
      throw error;
    }
  }

  listCalendars(organizationId: string) {
    return this.db
      .select()
      .from(schedulingCalendars)
      .where(eq(schedulingCalendars.organizationId, organizationId))
      .orderBy(asc(schedulingCalendars.name));
  }

  /** Agenda com regras e exceções; `null` fora do tenant. */
  async getCalendar(organizationId: string, calendarId: string) {
    const row = await findCalendarRow(this.db, { organizationId, calendarId });
    if (!row) return null;
    const snapshot = await loadCalendarSnapshot(this.db, row);
    return { calendar: row, rules: snapshot.rules, exceptions: snapshot.exceptions };
  }

  updatePolicy(input: CalendarVersionedCommand & { readonly policy: SchedulingPolicy }) {
    return this.db.transaction((tx) =>
      updateCalendarVersioned(
        tx,
        { ...input, action: 'scheduling_calendar.policy_updated' },
        async () => ({
          ...input.policy,
        }),
      ),
    );
  }

  /** Existência do calendário no tenant, sem travar (consultas de leitura). */
  async exists(organizationId: string, calendarId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schedulingCalendars.id })
      .from(schedulingCalendars)
      .where(
        and(
          eq(schedulingCalendars.id, calendarId),
          eq(schedulingCalendars.organizationId, organizationId),
        ),
      );
    return row !== undefined;
  }
}
