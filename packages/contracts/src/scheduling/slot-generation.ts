import { resolveLocalDayWindows } from './availability-windows.js';
import type {
  AvailabilityException,
  SchedulingPolicy,
  WeeklyAvailabilityRule,
} from './scheduling-policy.js';
import { addDaysToLocalDate, localDateOf, zonedWallTimeToInstant } from './zoned-wall-time.js';

/**
 * E1 (DEC-074) — horários livres de uma agenda. Grade fixa por janela local
 * (passo = duração da reunião), respeitando antecedência mínima, horizonte de
 * reserva, intervalo entre reuniões (buffer) e reuniões já marcadas.
 */
export interface TimeInterval {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface SchedulingCalendarSnapshot {
  readonly policy: SchedulingPolicy;
  readonly rules: readonly WeeklyAvailabilityRule[];
  readonly exceptions: readonly AvailabilityException[];
}

export interface SlotSearchInput {
  readonly calendar: SchedulingCalendarSnapshot;
  /** Reuniões ativas da agenda (o intervalo de buffer é aplicado aqui). */
  readonly busy: readonly TimeInterval[];
  readonly now: Date;
  readonly from: Date;
  readonly to: Date;
  readonly limit: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Teto de dias locais percorridos por consulta (a janela pedida é menor). */
export const MAX_SLOT_SEARCH_DAYS = 62;

/** Conflito com reunião ativa, contando o intervalo mínimo entre reuniões. */
export function conflictsWithBusy(
  slot: TimeInterval,
  busy: readonly TimeInterval[],
  bufferMinutes: number,
): boolean {
  const buffer = bufferMinutes * MINUTE_MS;
  return busy.some(
    (meeting) =>
      slot.startsAt.getTime() < meeting.endsAt.getTime() + buffer &&
      meeting.startsAt.getTime() < slot.endsAt.getTime() + buffer,
  );
}

/** Todos os horários da grade de uma data local, sem filtros de tempo ou ocupação. */
export function gridSlotsForLocalDate(
  calendar: SchedulingCalendarSnapshot,
  localDate: string,
): TimeInterval[] {
  const { timezone, slotDurationMinutes } = calendar.policy;
  const windows = resolveLocalDayWindows({ localDate, ...calendar });
  const slots: TimeInterval[] = [];
  for (const window of windows) {
    for (
      let m = window.startMinute;
      m + slotDurationMinutes <= window.endMinute;
      m += slotDurationMinutes
    ) {
      const startsAt = zonedWallTimeToInstant(localDate, m, timezone);
      if (startsAt === null) continue;
      slots.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + slotDurationMinutes * MINUTE_MS),
      });
    }
  }
  return slots;
}

/** Limites de tempo da política: [agora + antecedência, agora + horizonte]. */
export function bookableTimeBounds(policy: SchedulingPolicy, now: Date) {
  return {
    earliest: now.getTime() + policy.minimumNoticeMinutes * MINUTE_MS,
    latest: now.getTime() + policy.bookingHorizonDays * DAY_MS,
  };
}

function isWithinSearch(slot: TimeInterval, input: SlotSearchInput): boolean {
  const { earliest, latest } = bookableTimeBounds(input.calendar.policy, input.now);
  const start = slot.startsAt.getTime();
  return (
    start >= input.from.getTime() &&
    start < input.to.getTime() &&
    start >= earliest &&
    start <= latest &&
    !conflictsWithBusy(slot, input.busy, input.calendar.policy.bufferMinutes)
  );
}

export function listAvailableSlots(input: SlotSearchInput): TimeInterval[] {
  const { timezone } = input.calendar.policy;
  const result: TimeInterval[] = [];
  const seen = new Set<number>();
  let localDate = localDateOf(input.from, timezone);
  const lastDate = localDateOf(input.to, timezone);
  for (let day = 0; day < MAX_SLOT_SEARCH_DAYS && localDate <= lastDate; day += 1) {
    for (const slot of gridSlotsForLocalDate(input.calendar, localDate)) {
      if (result.length >= input.limit) return result;
      if (seen.has(slot.startsAt.getTime()) || !isWithinSearch(slot, input)) continue;
      seen.add(slot.startsAt.getTime());
      result.push(slot);
    }
    localDate = addDaysToLocalDate(localDate, 1);
  }
  return result;
}
