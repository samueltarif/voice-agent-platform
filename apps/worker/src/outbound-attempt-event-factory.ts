import type { OutboundAttempt, OutboundAttemptEventType } from '@voice-agent/contracts';

export interface AttemptEventClock {
  readonly newEventId: () => string;
  readonly now: () => Date;
}

export interface BuildAttemptEventInput {
  readonly attempt: OutboundAttempt;
  readonly type: OutboundAttemptEventType;
  readonly clock: AttemptEventClock;
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
}

/** Monta um evento interno correlacionado à tentativa (id e relógio injetados). */
export function buildAttemptEvent(input: BuildAttemptEventInput): Record<string, unknown> {
  const { attempt, type, clock, extra } = input;
  return {
    eventId: clock.newEventId(),
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
    jobId: attempt.jobId,
    occurredAt: clock.now().toISOString(),
    type,
    ...extra,
  };
}
