import { z } from 'zod';

export const OUTBOUND_CALL_JOB_STATUSES = [
  'SCHEDULED',
  'CLAIMED',
  'DISPATCHED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'COMPLETED',
  'CANCELED',
] as const;

export const outboundCallJobStatusSchema = z.enum(OUTBOUND_CALL_JOB_STATUSES);
export type OutboundCallJobStatus = z.infer<typeof outboundCallJobStatusSchema>;

export const TERMINAL_OUTBOUND_JOB_STATUSES: ReadonlySet<OutboundCallJobStatus> = new Set([
  'FAILED_TERMINAL',
  'COMPLETED',
  'CANCELED',
]);

const ALLOWED_TRANSITIONS: Readonly<
  Record<OutboundCallJobStatus, ReadonlySet<OutboundCallJobStatus>>
> = {
  SCHEDULED: new Set(['CLAIMED', 'CANCELED']),
  CLAIMED: new Set(['DISPATCHED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELED']),
  FAILED_RETRYABLE: new Set(['CLAIMED', 'CANCELED']),
  DISPATCHED: new Set(['COMPLETED', 'FAILED_TERMINAL', 'CANCELED']),
  FAILED_TERMINAL: new Set(),
  COMPLETED: new Set(),
  CANCELED: new Set(),
};

export function isValidJobStatusTransition(
  from: OutboundCallJobStatus,
  to: OutboundCallJobStatus,
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

export function validateJobStatusTransition(
  from: OutboundCallJobStatus,
  to: OutboundCallJobStatus,
): void {
  if (!isValidJobStatusTransition(from, to)) {
    throw new Error(`Invalid outbound job status transition from '${from}' to '${to}'`);
  }
}
