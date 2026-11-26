import { z } from 'zod';
import { isValidIanaTimezone } from '../telephony/date-timezone-boundary.js';
import { isValidLocalDate, MINUTES_PER_DAY } from './zoned-wall-time.js';

/**
 * E1 (DEC-074) — política e disponibilidade de uma agenda. Horários locais
 * trafegam como `HH:MM` (fim pode ser `24:00`) e são guardados em minutos do
 * dia; datas locais como `AAAA-MM-DD`. Tudo é interpretado no fuso da agenda.
 */
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/** `HH:MM` → minuto do dia (0–1440). */
export function parseLocalTime(value: string): number {
  if (!LOCAL_TIME_PATTERN.test(value)) throw new RangeError(`Invalid local time: ${value}`);
  const [hours, minutes] = value.split(':').map(Number);
  return hours! * 60 + minutes!;
}

/** Minuto do dia → `HH:MM`. */
export function formatLocalTime(minuteOfDay: number): string {
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  return `${hours}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

export const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidIanaTimezone, 'Unknown IANA timezone');

export const localDateSchema = z.string().refine(isValidLocalDate, 'Invalid local date');

const localTimeSchema = z.string().regex(LOCAL_TIME_PATTERN, 'Expected HH:MM');

export const schedulingPolicySchema = z
  .object({
    timezone: ianaTimezoneSchema,
    slotDurationMinutes: z.number().int().min(5).max(480),
    bufferMinutes: z.number().int().min(0).max(240),
    minimumNoticeMinutes: z.number().int().min(0).max(43_200),
    bookingHorizonDays: z.number().int().min(1).max(365),
  })
  .strict();
export type SchedulingPolicy = z.infer<typeof schedulingPolicySchema>;

/** Janela local de um dia, em minutos (`startMinute` < `endMinute`). */
export interface MinuteWindow {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface WeeklyAvailabilityRule extends MinuteWindow {
  /** ISO: 1 = segunda … 7 = domingo. */
  readonly weekday: number;
}

export const weeklyAvailabilityRuleInputSchema = z
  .object({ weekday: z.number().int().min(1).max(7), start: localTimeSchema, end: localTimeSchema })
  .strict()
  .transform((rule, ctx): WeeklyAvailabilityRule => {
    const startMinute = parseLocalTime(rule.start);
    const endMinute = parseLocalTime(rule.end);
    if (startMinute >= endMinute || startMinute >= MINUTES_PER_DAY) {
      ctx.addIssue({ code: 'custom', message: 'start must be before end' });
      return z.NEVER;
    }
    return { weekday: rule.weekday, startMinute, endMinute };
  });

function hasOverlap(rules: readonly WeeklyAvailabilityRule[]): boolean {
  const sorted = [...rules].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  return sorted.some((rule, index) => {
    const next = sorted[index + 1];
    return next !== undefined && next.weekday === rule.weekday && next.startMinute < rule.endMinute;
  });
}

export const weeklyAvailabilityInputSchema = z
  .array(weeklyAvailabilityRuleInputSchema)
  .max(70)
  .refine((rules) => !hasOverlap(rules), 'Overlapping windows on the same weekday');

export const AVAILABILITY_EXCEPTION_KINDS = ['UNAVAILABLE', 'AVAILABLE'] as const;
export type AvailabilityExceptionKind = (typeof AVAILABILITY_EXCEPTION_KINDS)[number];

/** Exceção de uma data local: bloqueio (dia inteiro ou janela) ou horário extra. */
export interface AvailabilityException {
  readonly localDate: string;
  readonly kind: AvailabilityExceptionKind;
  readonly window: MinuteWindow | null;
}

export const availabilityExceptionInputSchema = z
  .object({
    date: localDateSchema,
    kind: z.enum(AVAILABILITY_EXCEPTION_KINDS),
    start: localTimeSchema.optional(),
    end: localTimeSchema.optional(),
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .transform((input, ctx) => {
    const window = resolveExceptionWindow(input.start, input.end);
    if (window === 'INVALID' || (input.kind === 'AVAILABLE' && window === null)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid or missing start/end window' });
      return z.NEVER;
    }
    return { localDate: input.date, kind: input.kind, window, reason: input.reason ?? null };
  });

function resolveExceptionWindow(start?: string, end?: string): MinuteWindow | null | 'INVALID' {
  if (start === undefined && end === undefined) return null;
  if (start === undefined || end === undefined) return 'INVALID';
  const window = { startMinute: parseLocalTime(start), endMinute: parseLocalTime(end) };
  return window.startMinute < window.endMinute ? window : 'INVALID';
}
