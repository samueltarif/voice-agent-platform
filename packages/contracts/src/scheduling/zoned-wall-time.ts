import { offsetMsAt } from '../telephony/date-timezone-boundary.js';

/**
 * E1 (DEC-074) — conversão entre data/hora LOCAL de uma agenda (fuso IANA) e
 * instante UTC, segura em horário de verão:
 * - horário inexistente (pulo da primavera) → `null` (o horário não é ofertado);
 * - horário ambíguo (recuo do outono) → primeira ocorrência, determinística.
 */
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export const MINUTES_PER_DAY = 1440;

/** Data local `AAAA-MM-DD` válida no calendário (rejeita 2026-02-30). */
export function isValidLocalDate(value: string): boolean {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function localDateToUtcMidnight(localDate: string): number {
  if (!isValidLocalDate(localDate)) throw new RangeError(`Invalid local date: ${localDate}`);
  return Date.parse(`${localDate}T00:00:00.000Z`);
}

/** Soma dias corridos a uma data local (aritmética de calendário, sem fuso). */
export function addDaysToLocalDate(localDate: string, days: number): string {
  return new Date(localDateToUtcMidnight(localDate) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Dia da semana ISO (1 = segunda … 7 = domingo) de uma data local. */
export function isoWeekdayOf(localDate: string): number {
  const weekday = new Date(localDateToUtcMidnight(localDate)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Data local (`AAAA-MM-DD`) do instante no fuso informado. */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Minuto do dia local (0–1439) do instante no fuso informado. */
export function localMinuteOf(instant: Date, timeZone: string): number {
  const wall = instant.getTime() + offsetMsAt(instant, timeZone);
  return Math.floor((((wall % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS);
}

/**
 * Instante UTC de `localDate` + `minuteOfDay` (0–1440; 1440 = meia-noite do
 * dia seguinte) no fuso. `null` quando o horário local não existe.
 */
export function zonedWallTimeToInstant(
  localDate: string,
  minuteOfDay: number,
  timeZone: string,
): Date | null {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > MINUTES_PER_DAY) {
    throw new RangeError(`Invalid minute of day: ${minuteOfDay}`);
  }
  const wall = localDateToUtcMidnight(localDate) + minuteOfDay * MINUTE_MS;
  // Os deslocamentos de um dia antes e de um dia depois cobrem a (única)
  // transição possível: cada um gera um candidato, validado por ida e volta.
  const offsets = [wall - DAY_MS, wall + DAY_MS].map((t) => offsetMsAt(new Date(t), timeZone));
  const valid = offsets
    .map((offset) => wall - offset)
    .filter((candidate) => candidate + offsetMsAt(new Date(candidate), timeZone) === wall);
  return valid.length === 0 ? null : new Date(Math.min(...valid));
}

/** Maior pulo de horário de verão considerado na busca de fronteira (minutos). */
const MAX_DST_GAP_MINUTES = 180;

/**
 * Instante de uma FRONTEIRA de janela local. Se o horário não existe (pulo do
 * horário de verão), usa o primeiro minuto local existente depois dele, que é
 * o instante da transição. Ambíguo: primeira ocorrência (conservador).
 */
export function zonedBoundaryInstant(
  localDate: string,
  minuteOfDay: number,
  timeZone: string,
): Date {
  for (let delta = 0; delta <= MAX_DST_GAP_MINUTES; delta += 1) {
    const minute = minuteOfDay + delta;
    const date = minute > MINUTES_PER_DAY ? addDaysToLocalDate(localDate, 1) : localDate;
    const instant = zonedWallTimeToInstant(
      date,
      minute > MINUTES_PER_DAY ? minute - MINUTES_PER_DAY : minute,
      timeZone,
    );
    if (instant !== null) return instant;
  }
  throw new RangeError(`No valid local time near ${localDate} ${minuteOfDay} in ${timeZone}`);
}
