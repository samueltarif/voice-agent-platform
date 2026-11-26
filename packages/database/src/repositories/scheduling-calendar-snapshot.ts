import { and, asc, eq, gt, lt } from 'drizzle-orm';
import type {
  AvailabilityException,
  SchedulingCalendarSnapshot,
  TimeInterval,
} from '@voice-agent/contracts';
import { meetings } from '../schema/meetings.js';
import {
  schedulingAvailabilityExceptions,
  schedulingAvailabilityRules,
  schedulingCalendars,
  type SchedulingCalendarEntity,
} from '../schema/scheduling-calendars.js';
import type { DatabaseExecutor } from './database-executor.js';

/**
 * E1 (DEC-074) — leitura da agenda no formato das regras puras. `lock`
 * trava a linha da agenda (FOR UPDATE): reservas da mesma agenda ficam
 * serializadas, e a exclusão no banco continua como última barreira.
 */
export async function findCalendarRow(
  executor: DatabaseExecutor,
  input: {
    readonly organizationId: string;
    readonly calendarId: string;
    /** `true` = `FOR UPDATE` (reserva); `'key share'` = só impede a exclusão (oferta). */
    readonly lock?: boolean | 'key share';
  },
): Promise<SchedulingCalendarEntity | null> {
  const query = executor
    .select()
    .from(schedulingCalendars)
    .where(
      and(
        eq(schedulingCalendars.id, input.calendarId),
        eq(schedulingCalendars.organizationId, input.organizationId),
      ),
    );
  if (input.lock === 'key share') return (await query.for('key share'))[0] ?? null;
  const [row] = input.lock ? await query.for('update') : await query;
  return row ?? null;
}

export async function loadCalendarSnapshot(
  executor: DatabaseExecutor,
  row: SchedulingCalendarEntity,
): Promise<SchedulingCalendarSnapshot> {
  const rules = await executor
    .select()
    .from(schedulingAvailabilityRules)
    .where(
      and(
        eq(schedulingAvailabilityRules.calendarId, row.id),
        eq(schedulingAvailabilityRules.organizationId, row.organizationId),
      ),
    )
    .orderBy(
      asc(schedulingAvailabilityRules.weekday),
      asc(schedulingAvailabilityRules.startMinute),
    );
  const exceptions = await executor
    .select()
    .from(schedulingAvailabilityExceptions)
    .where(
      and(
        eq(schedulingAvailabilityExceptions.calendarId, row.id),
        eq(schedulingAvailabilityExceptions.organizationId, row.organizationId),
      ),
    );
  return {
    policy: {
      timezone: row.timezone,
      slotDurationMinutes: row.slotDurationMinutes,
      bufferMinutes: row.bufferMinutes,
      minimumNoticeMinutes: row.minimumNoticeMinutes,
      bookingHorizonDays: row.bookingHorizonDays,
    },
    rules: rules.map(({ weekday, startMinute, endMinute }) => ({
      weekday,
      startMinute,
      endMinute,
    })),
    exceptions: exceptions.map(toException),
  };
}

/**
 * Auditoria M1 — exceções com o identificador persistido, para que a API
 * possa expor o `id` exigido pela remoção (`DELETE .../exceptions/:id`).
 */
export async function loadExceptionRecords(
  executor: DatabaseExecutor,
  row: SchedulingCalendarEntity,
) {
  const exceptions = await executor
    .select()
    .from(schedulingAvailabilityExceptions)
    .where(
      and(
        eq(schedulingAvailabilityExceptions.calendarId, row.id),
        eq(schedulingAvailabilityExceptions.organizationId, row.organizationId),
      ),
    )
    .orderBy(
      asc(schedulingAvailabilityExceptions.localDate),
      asc(schedulingAvailabilityExceptions.id),
    );
  return exceptions.map((exception) => ({ id: exception.id, ...toException(exception) }));
}

function toException(
  row: typeof schedulingAvailabilityExceptions.$inferSelect,
): AvailabilityException {
  const window =
    row.startMinute === null || row.endMinute === null
      ? null
      : { startMinute: row.startMinute, endMinute: row.endMinute };
  return { localDate: row.localDate, kind: row.kind, window };
}

/** Reuniões ATIVAS que tocam o intervalo (com folga para o buffer). */
export async function loadBusyIntervals(
  executor: DatabaseExecutor,
  input: { readonly row: SchedulingCalendarEntity; readonly from: Date; readonly to: Date },
): Promise<TimeInterval[]> {
  const margin = (input.row.bufferMinutes + input.row.slotDurationMinutes) * 60_000;
  return executor
    .select({ startsAt: meetings.startsAt, endsAt: meetings.endsAt })
    .from(meetings)
    .where(
      and(
        eq(meetings.calendarId, input.row.id),
        eq(meetings.organizationId, input.row.organizationId),
        eq(meetings.status, 'SCHEDULED'),
        lt(meetings.startsAt, new Date(input.to.getTime() + margin)),
        gt(meetings.endsAt, new Date(input.from.getTime() - margin)),
      ),
    );
}
