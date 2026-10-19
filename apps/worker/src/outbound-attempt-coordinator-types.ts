import type {
  ApplyOutboundAttemptEventResult,
  OutboundAttempt,
  SuccessorAttemptBlockReason,
  TelephonyOriginationPort,
  TelephonyReconciliationPort,
} from '@voice-agent/contracts';
import type { InMemoryOutboundAttemptStore } from './in-memory-outbound-attempt-store.js';
import type { AttemptEventClock } from './outbound-attempt-event-factory.js';

export interface OutboundAttemptCoordinatorDependencies extends AttemptEventClock {
  readonly store: InMemoryOutboundAttemptStore;
  readonly origination: TelephonyOriginationPort;
  readonly reconciliation: TelephonyReconciliationPort;
  /** Identidade desta autoridade de originação (uma única por tentativa). */
  readonly authorityId: string;
}

export interface PrepareAttemptInput {
  readonly attemptId: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly campaignId?: string | undefined;
  readonly correlationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly jobIdempotencyKey: string;
  readonly maxAttempts: number;
}

export interface AttemptRef {
  readonly organizationId: string;
  readonly attemptId: string;
}

export type PrepareAttemptResult =
  | { readonly kind: 'PREPARED'; readonly attempt: OutboundAttempt }
  | { readonly kind: 'BLOCKED'; readonly reason: SuccessorAttemptBlockReason };

export type StepResult = ApplyOutboundAttemptEventResult | { readonly kind: 'NOT_FOUND' };

export type OriginateResult =
  | { readonly kind: 'ORIGINATED'; readonly result: StepResult }
  | { readonly kind: 'NOT_SENT'; readonly reason: string };
