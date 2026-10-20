import { createOutboundAttempt, type OutboundAttempt } from './outbound-attempt.js';
import type { OutboundAttemptEvent } from './outbound-attempt-event.js';

/** Identificadores sintéticos fixos para testes offline (sem dados reais). */
export const FIXTURE_IDS = {
  orgA: '11111111-1111-4111-8111-111111111111',
  orgB: '22222222-2222-4222-8222-222222222222',
  job: '33333333-3333-4333-8333-333333333333',
  attempt: '44444444-4444-4444-8444-444444444444',
  correlation: '55555555-5555-4555-8555-555555555555',
  agent: '66666666-6666-4666-8666-666666666666',
  agentVersion: '77777777-7777-4777-8777-777777777777',
  session: '88888888-8888-4888-8888-888888888888',
} as const;

export const FIXTURE_DESTINATION = '+15555550100';
export const FIXTURE_NOW = '2026-10-19T12:00:00.000Z';

export function buildFixtureAttempt(overrides: Partial<OutboundAttempt> = {}): OutboundAttempt {
  const base = createOutboundAttempt({
    id: FIXTURE_IDS.attempt,
    organizationId: FIXTURE_IDS.orgA,
    jobId: FIXTURE_IDS.job,
    attemptNumber: 1,
    correlationId: FIXTURE_IDS.correlation,
    agentId: FIXTURE_IDS.agent,
    agentVersionId: FIXTURE_IDS.agentVersion,
    jobIdempotencyKey: 'job-key',
    createdAt: FIXTURE_NOW,
  });
  return { ...base, ...overrides };
}

let eventCounter = 0;

function nextEventId(): string {
  eventCounter += 1;
  return `00000000-0000-4000-8000-${String(eventCounter).padStart(12, '0')}`;
}

/** Evento válido e correlacionado com a tentativa; `extra` completa o payload do tipo. */
export function buildFixtureEvent(
  attempt: OutboundAttempt,
  type: OutboundAttemptEvent['type'],
  extra: Record<string, unknown> = {},
): OutboundAttemptEvent {
  return {
    eventId: nextEventId(),
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
    jobId: attempt.jobId,
    occurredAt: FIXTURE_NOW,
    type,
    ...(type === 'SEND_STARTED' ? { authorityId: 'authority-1' } : {}),
    ...(type === 'ORIGINATION_REJECTED' ? { reasonCode: 'PROVIDER_REFUSED' } : {}),
    ...(type === 'ORIGINATION_RESULT_UNKNOWN' ? { reasonCode: 'TIMEOUT' } : {}),
    ...extra,
  } as OutboundAttemptEvent;
}
