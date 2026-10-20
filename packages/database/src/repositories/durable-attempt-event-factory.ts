import type { OutboundAttempt, OutboundAttemptEventType } from '@voice-agent/contracts';

export interface InternalAttemptEventInput {
  readonly attempt: Pick<OutboundAttempt, 'id' | 'organizationId' | 'jobId'>;
  readonly type: OutboundAttemptEventType;
  readonly eventId: string;
  readonly now: Date;
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
}

/** Evento interno do domínio com id estável fornecido pelo chamador. */
export function buildInternalAttemptEvent(
  input: InternalAttemptEventInput,
): Record<string, unknown> {
  return {
    eventId: input.eventId,
    organizationId: input.attempt.organizationId,
    attemptId: input.attempt.id,
    jobId: input.attempt.jobId,
    occurredAt: input.now.toISOString(),
    type: input.type,
    ...input.extra,
  };
}
