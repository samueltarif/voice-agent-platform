import {
  bookableTimeBounds,
  conflictsWithBusy,
  gridSlotsForLocalDate,
  type SchedulingCalendarSnapshot,
  type TimeInterval,
} from './slot-generation.js';
import { localDateOf } from './zoned-wall-time.js';

/**
 * E1 (DEC-074) — validação AUTORITATIVA de um horário antes de gravar uma
 * reunião. Roda de novo dentro da transação da reserva, com a agenda travada,
 * para que nenhum horário fora da disponibilidade ou ocupado seja aceito.
 */
export type SlotBookabilityBlockReason =
  | 'INVALID_START'
  | 'INSIDE_MINIMUM_NOTICE'
  | 'BEYOND_BOOKING_HORIZON'
  | 'OUTSIDE_AVAILABILITY'
  | 'SLOT_CONFLICT';

export type SlotBookabilityVerdict =
  | { readonly ok: true; readonly slot: TimeInterval }
  | { readonly ok: false; readonly reason: SlotBookabilityBlockReason };

export interface SlotBookabilityInput {
  readonly calendar: SchedulingCalendarSnapshot;
  readonly busy: readonly TimeInterval[];
  readonly now: Date;
  readonly startsAt: Date;
}

export function evaluateSlotBookability(input: SlotBookabilityInput): SlotBookabilityVerdict {
  const start = input.startsAt.getTime();
  if (!Number.isFinite(start)) return { ok: false, reason: 'INVALID_START' };
  const { earliest, latest } = bookableTimeBounds(input.calendar.policy, input.now);
  if (start < earliest) return { ok: false, reason: 'INSIDE_MINIMUM_NOTICE' };
  if (start > latest) return { ok: false, reason: 'BEYOND_BOOKING_HORIZON' };
  const localDate = localDateOf(input.startsAt, input.calendar.policy.timezone);
  const slot = gridSlotsForLocalDate(input.calendar, localDate).find(
    (candidate) => candidate.startsAt.getTime() === start,
  );
  if (!slot) return { ok: false, reason: 'OUTSIDE_AVAILABILITY' };
  if (conflictsWithBusy(slot, input.busy, input.calendar.policy.bufferMinutes)) {
    return { ok: false, reason: 'SLOT_CONFLICT' };
  }
  return { ok: true, slot };
}
