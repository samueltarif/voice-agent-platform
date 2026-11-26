import { and, eq } from 'drizzle-orm';
import type { AvailabilityException, WeeklyAvailabilityRule } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import {
  schedulingAvailabilityExceptions,
  schedulingAvailabilityRules,
} from '../schema/scheduling-calendars.js';
import {
  updateCalendarVersioned,
  type CalendarVersionedCommand,
  type CalendarVersionedOutcome,
} from './scheduling-calendar-repository.js';

export type AvailabilityExceptionInput = AvailabilityException & { readonly reason: string | null };

/**
 * E1 (DEC-074) — disponibilidade semanal e exceções de uma agenda. Cada
 * mudança passa pela versão da agenda (concorrência otimista) e é auditada.
 */
export class DrizzleSchedulingAvailabilityRepository {
  constructor(private readonly db: DatabaseInstance) {}

  replaceWeeklyAvailability(
    input: CalendarVersionedCommand & { readonly rules: readonly WeeklyAvailabilityRule[] },
  ): Promise<CalendarVersionedOutcome> {
    return this.db.transaction((tx) =>
      updateCalendarVersioned(
        tx,
        { ...input, action: 'scheduling_calendar.availability_replaced' },
        async (row) => {
          await tx
            .delete(schedulingAvailabilityRules)
            .where(
              and(
                eq(schedulingAvailabilityRules.calendarId, row.id),
                eq(schedulingAvailabilityRules.organizationId, row.organizationId),
              ),
            );
          if (input.rules.length > 0) {
            await tx.insert(schedulingAvailabilityRules).values(
              input.rules.map((rule) => ({
                organizationId: row.organizationId,
                calendarId: row.id,
                ...rule,
              })),
            );
          }
          return {};
        },
      ),
    );
  }

  addException(
    input: CalendarVersionedCommand & { readonly exception: AvailabilityExceptionInput },
  ): Promise<CalendarVersionedOutcome> {
    const { exception } = input;
    return this.db.transaction((tx) =>
      updateCalendarVersioned(
        tx,
        { ...input, action: 'scheduling_calendar.exception_added' },
        async (row) => {
          await tx.insert(schedulingAvailabilityExceptions).values({
            organizationId: row.organizationId,
            calendarId: row.id,
            localDate: exception.localDate,
            kind: exception.kind,
            startMinute: exception.window?.startMinute ?? null,
            endMinute: exception.window?.endMinute ?? null,
            reason: exception.reason,
          });
          return {};
        },
      ),
    );
  }

  /**
   * Remove uma exceção da agenda; outra agenda ou outro tenant = `NOT_FOUND`.
   * A ausência é detectada ANTES de qualquer escrita (versão intacta).
   */
  removeException(
    input: CalendarVersionedCommand & { readonly exceptionId: string },
  ): Promise<CalendarVersionedOutcome> {
    return this.db.transaction(async (tx) => {
      const outcome = await updateCalendarVersioned(
        tx,
        { ...input, action: 'scheduling_calendar.exception_removed' },
        async (row) => {
          const deleted = await tx
            .delete(schedulingAvailabilityExceptions)
            .where(
              and(
                eq(schedulingAvailabilityExceptions.id, input.exceptionId),
                eq(schedulingAvailabilityExceptions.calendarId, row.id),
                eq(schedulingAvailabilityExceptions.organizationId, row.organizationId),
              ),
            )
            .returning({ id: schedulingAvailabilityExceptions.id });
          if (deleted.length === 0) throw new ExceptionNotFound();
          return {};
        },
      ).catch((error: unknown) => {
        if (error instanceof ExceptionNotFound) return { kind: 'NOT_FOUND' as const };
        throw error;
      });
      return outcome;
    });
  }
}

/** Sinal interno: desfaz a transação quando a exceção não pertence à agenda. */
class ExceptionNotFound extends Error {
  constructor() {
    super('Availability exception not found in calendar.');
    this.name = 'ExceptionNotFound';
  }
}
