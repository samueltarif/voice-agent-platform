import type {
  CallbackTokenEntropySource,
  CallbackTokenHasher,
  ConversationSessionPort,
} from '@voice-agent/contracts';
import type { InMemorySessionAttemptStore } from './in-memory-session-attempt-store.js';
import type { OutboundAttemptOriginationCoordinator } from './outbound-attempt-origination-coordinator.js';
import type { PrepareAttemptInput } from './outbound-attempt-coordinator-types.js';
import type { OutboundSessionGateInput } from './outbound-session-gate.js';

/** Encerramento da perna telefônica pela referência do provedor (idempotente). */
export interface CallControlPort {
  hangUp(providerReference: string): Promise<'ENDED' | 'NOT_FOUND' | 'UNKNOWN'>;
}

/** Contexto de discagem entregue UMA vez ao adaptador de telefonia (nunca persistido em claro). */
export interface DialContext {
  readonly callerId: string;
  readonly sipUri: string;
  readonly callbackToken: string;
}

/**
 * Validade desconhecida da sessão preparada. O padrão é RECUSAR (DEC-052: não
 * confiar na validade desconhecida do URI SIP). `ACCEPT_BY_HUMAN_DECISION` só
 * pode ser configurado com decisão humana registrada (D-REG-TIMING aberta).
 */
export type UnknownValidityPolicy = 'REFUSE' | 'ACCEPT_BY_HUMAN_DECISION';

export interface OutboundSessionOrchestratorDependencies {
  readonly coordinator: OutboundAttemptOriginationCoordinator;
  readonly conversation: ConversationSessionPort;
  readonly store: InMemorySessionAttemptStore;
  readonly entropy: CallbackTokenEntropySource;
  readonly hasher: CallbackTokenHasher;
  readonly unknownValidity: UnknownValidityPolicy;
  readonly now: () => Date;
}

export interface StartOutboundSessionInput {
  readonly attempt: PrepareAttemptInput;
  readonly destination: string;
  readonly callerId: string;
  readonly gate: OutboundSessionGateInput;
}

export type NotSentReason =
  | 'GATE_BLOCKED'
  | 'ATTEMPT_BLOCKED'
  | 'SESSION_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'SESSION_VALIDITY_UNKNOWN'
  | 'UNSUPPORTED_MEDIA_TARGET'
  | 'PREPARATION_NOT_PERSISTED'
  | 'ORIGINATION_REJECTED'
  | 'ORIGINATION_NOT_SENT';

export type StartOutboundSessionResult =
  | { readonly kind: 'SENT'; readonly providerReference: string | null }
  | { readonly kind: 'OUTCOME_UNKNOWN' }
  | { readonly kind: 'NOT_SENT'; readonly reason: NotSentReason; readonly detail?: string };
