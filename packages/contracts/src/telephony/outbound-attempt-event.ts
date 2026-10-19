import { z } from 'zod';

export const ORIGINATION_REJECTION_REASONS = [
  'DESTINATION_NOT_ALLOWED',
  'CALLER_IDENTITY_NOT_AUTHORIZED',
  'LIMIT_EXCEEDED',
  'PROVIDER_REFUSED',
] as const;
export const originationRejectionReasonSchema = z.enum(ORIGINATION_REJECTION_REASONS);
export type OriginationRejectionReason = z.infer<typeof originationRejectionReasonSchema>;

export const ORIGINATION_UNKNOWN_REASONS = [
  'TIMEOUT',
  'TRANSPORT_ERROR',
  'AMBIGUOUS_RESPONSE',
] as const;
export const originationUnknownReasonSchema = z.enum(ORIGINATION_UNKNOWN_REASONS);
export type OriginationUnknownReason = z.infer<typeof originationUnknownReasonSchema>;

/** Referência externa opaca: tratada como NÃO CONFIÁVEL até validação contratual. */
const providerReferenceSchema = z.string().trim().min(1).max(128);

const baseEvent = {
  eventId: z.string().uuid(),
  organizationId: z.string().uuid(),
  attemptId: z.string().uuid(),
  jobId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  callSessionId: z.string().uuid().optional(),
};

function eventOf<T extends string, S extends z.ZodRawShape>(type: T, shape: S) {
  return z.object({ ...baseEvent, type: z.literal(type), ...shape }).strict();
}

export const outboundAttemptEventSchema = z.discriminatedUnion('type', [
  eventOf('INTENT_RECORDED', {}),
  eventOf('SEND_STARTED', { authorityId: z.string().trim().min(1).max(64) }),
  eventOf('ORIGINATION_ACCEPTED', { providerReference: providerReferenceSchema.optional() }),
  eventOf('ORIGINATION_REJECTED', { reasonCode: originationRejectionReasonSchema }),
  eventOf('ORIGINATION_RESULT_UNKNOWN', { reasonCode: originationUnknownReasonSchema }),
  eventOf('CRASH_RECOVERY_DETECTED', {}),
  eventOf('RECONCILIATION_REQUESTED', {}),
  eventOf('RECONCILIATION_CONFIRMED_ORIGINATED', {
    providerReference: providerReferenceSchema.optional(),
  }),
  eventOf('RECONCILIATION_CONFIRMED_NOT_ORIGINATED', {}),
  eventOf('RECONCILIATION_INCONCLUSIVE', {}),
  eventOf('RECONCILIATION_TIMED_OUT', {}),
  eventOf('CALL_CLOSED_CONFIRMED', {}),
  eventOf('CANCEL_REQUESTED', {}),
]);

export type OutboundAttemptEvent = z.infer<typeof outboundAttemptEventSchema>;
export type OutboundAttemptEventType = OutboundAttemptEvent['type'];
