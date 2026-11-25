import { z } from 'zod';
import { leadStatusSchema } from './lead-status.js';
import {
  availabilityExceptionInputSchema,
  schedulingPolicySchema,
  weeklyAvailabilityInputSchema,
} from './scheduling-policy.js';

/** E1 (DEC-074) — entradas HTTP da agenda e dos leads (validadas na borda). */
export const MEETING_STATUSES = ['SCHEDULED', 'CANCELED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Janela máxima de uma consulta de horários livres. */
export const MAX_SLOT_QUERY_DAYS = 31;
export const MAX_SLOT_QUERY_LIMIT = 100;

/**
 * Chave de idempotência opaca escolhida por quem pede a reserva; única por
 * organização. Repetir a mesma chave com o mesmo pedido devolve a mesma
 * reunião; com pedido diferente é recusado.
 */
export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Unsupported characters in idempotency key');

const instantSchema = z.string().datetime({ offset: true });
const expectedVersionSchema = z.number().int().positive();
const reasonSchema = z.string().trim().min(1).max(500);

export const createLeadInputSchema = z.object({ contactId: z.string().uuid() }).strict();

export const changeLeadStatusInputSchema = z
  .object({
    status: leadStatusSchema,
    expectedVersion: expectedVersionSchema,
    reason: reasonSchema.optional(),
  })
  .strict();

export const createCalendarInputSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .merge(schedulingPolicySchema)
  .strict();

export const updateCalendarPolicyInputSchema = schedulingPolicySchema
  .extend({ expectedVersion: expectedVersionSchema })
  .strict();

export const replaceWeeklyAvailabilityInputSchema = z
  .object({ rules: weeklyAvailabilityInputSchema, expectedVersion: expectedVersionSchema })
  .strict();

export const createAvailabilityExceptionInputSchema = availabilityExceptionInputSchema;

export const slotQuerySchema = z
  .object({
    from: instantSchema,
    to: instantSchema,
    limit: z.coerce.number().int().min(1).max(MAX_SLOT_QUERY_LIMIT).default(20),
  })
  .refine((query) => {
    const span = Date.parse(query.to) - Date.parse(query.from);
    return span > 0 && span <= MAX_SLOT_QUERY_DAYS * 86_400_000;
  }, `Window must be positive and at most ${MAX_SLOT_QUERY_DAYS} days`);

export const bookMeetingInputSchema = z
  .object({
    calendarId: z.string().uuid(),
    leadId: z.string().uuid(),
    startsAt: instantSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const cancelMeetingInputSchema = z
  .object({ expectedVersion: expectedVersionSchema, reason: reasonSchema.optional() })
  .strict();

export const meetingListQuerySchema = z
  .object({
    calendarId: z.string().uuid().optional(),
    from: instantSchema,
    to: instantSchema,
  })
  .refine((query) => Date.parse(query.to) > Date.parse(query.from), 'to must be after from');
