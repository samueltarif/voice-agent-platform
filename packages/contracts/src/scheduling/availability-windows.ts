import type {
  AvailabilityException,
  MinuteWindow,
  WeeklyAvailabilityRule,
} from './scheduling-policy.js';
import { isoWeekdayOf, MINUTES_PER_DAY } from './zoned-wall-time.js';

/**
 * E1 (DEC-074) — janelas locais disponíveis de UMA data: regras semanais do
 * dia + exceções `AVAILABLE` da data, menos exceções `UNAVAILABLE` (o
 * bloqueio sempre vence; sem janela = dia inteiro bloqueado).
 */
export interface LocalDayAvailabilityInput {
  readonly localDate: string;
  readonly rules: readonly WeeklyAvailabilityRule[];
  readonly exceptions: readonly AvailabilityException[];
}

function mergeWindows(windows: readonly MinuteWindow[]): MinuteWindow[] {
  const sorted = [...windows].sort((a, b) => a.startMinute - b.startMinute);
  const merged: MinuteWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.startMinute <= last.endMinute) {
      merged[merged.length - 1] = {
        startMinute: last.startMinute,
        endMinute: Math.max(last.endMinute, window.endMinute),
      };
    } else {
      merged.push(window);
    }
  }
  return merged;
}

function subtractWindow(windows: readonly MinuteWindow[], cut: MinuteWindow): MinuteWindow[] {
  return windows.flatMap((window) => {
    if (cut.endMinute <= window.startMinute || cut.startMinute >= window.endMinute) {
      return [window];
    }
    const pieces: MinuteWindow[] = [];
    if (cut.startMinute > window.startMinute) {
      pieces.push({ startMinute: window.startMinute, endMinute: cut.startMinute });
    }
    if (cut.endMinute < window.endMinute) {
      pieces.push({ startMinute: cut.endMinute, endMinute: window.endMinute });
    }
    return pieces;
  });
}

const WHOLE_DAY: MinuteWindow = { startMinute: 0, endMinute: MINUTES_PER_DAY };

export function resolveLocalDayWindows(input: LocalDayAvailabilityInput): MinuteWindow[] {
  const weekday = isoWeekdayOf(input.localDate);
  const ofDate = input.exceptions.filter((exception) => exception.localDate === input.localDate);
  const added = ofDate
    .filter((exception) => exception.kind === 'AVAILABLE' && exception.window !== null)
    .map((exception) => exception.window as MinuteWindow);
  const base = input.rules
    .filter((rule) => rule.weekday === weekday)
    .map(({ startMinute, endMinute }) => ({ startMinute, endMinute }));
  let windows = mergeWindows([...base, ...added]);
  for (const exception of ofDate) {
    if (exception.kind !== 'UNAVAILABLE') continue;
    windows = subtractWindow(windows, exception.window ?? WHOLE_DAY);
  }
  return windows;
}
