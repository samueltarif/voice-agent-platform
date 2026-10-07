import { InvalidStateTransitionError } from '@voice-agent/errors';

export type HumanHandoffState =
  | 'NONE'
  | 'REQUESTED'
  | 'SELLER_NOTIFIED'
  | 'SELLER_READY'
  | 'AI_PREPARING'
  | 'READY_TO_JOIN'
  | 'HUMAN_CONNECTED'
  | 'AI_DETACHED'
  | 'FAILED'
  | 'CANCELED'
  | 'TIMED_OUT';

export const TERMINAL_HANDOFF_STATES: ReadonlySet<HumanHandoffState> = new Set([
  'AI_DETACHED',
  'FAILED',
  'CANCELED',
  'TIMED_OUT',
]);

const ALLOWED_HANDOFF_TRANSITIONS: Readonly<
  Record<HumanHandoffState, ReadonlySet<HumanHandoffState>>
> = {
  NONE: new Set<HumanHandoffState>(['REQUESTED']),
  REQUESTED: new Set<HumanHandoffState>(['SELLER_NOTIFIED', 'FAILED', 'CANCELED', 'TIMED_OUT']),
  SELLER_NOTIFIED: new Set<HumanHandoffState>(['SELLER_READY', 'FAILED', 'CANCELED', 'TIMED_OUT']),
  SELLER_READY: new Set<HumanHandoffState>(['AI_PREPARING', 'FAILED', 'CANCELED', 'TIMED_OUT']),
  AI_PREPARING: new Set<HumanHandoffState>(['READY_TO_JOIN', 'FAILED', 'CANCELED', 'TIMED_OUT']),
  READY_TO_JOIN: new Set<HumanHandoffState>(['HUMAN_CONNECTED', 'FAILED', 'CANCELED', 'TIMED_OUT']),
  HUMAN_CONNECTED: new Set<HumanHandoffState>(['AI_DETACHED']),
  AI_DETACHED: new Set<HumanHandoffState>(),
  FAILED: new Set<HumanHandoffState>(),
  CANCELED: new Set<HumanHandoffState>(),
  TIMED_OUT: new Set<HumanHandoffState>(),
};

const CANONICAL_HANDOFF_EVENTS: Readonly<Partial<Record<HumanHandoffState, string>>> = {
  REQUESTED: 'call.handoff_requested',
  SELLER_NOTIFIED: 'call.seller_notified',
  SELLER_READY: 'call.seller_ready',
  READY_TO_JOIN: 'call.handoff_ready',
  HUMAN_CONNECTED: 'call.human_joined',
  AI_DETACHED: 'call.ai_detached',
  FAILED: 'call.handoff_failed',
  CANCELED: 'call.handoff_canceled',
};

const FALLBACK_TRIGGER_STATES: ReadonlySet<HumanHandoffState> = new Set([
  'FAILED',
  'CANCELED',
  'TIMED_OUT',
]);

export interface HumanHandoffSession {
  readonly callId: string;
  readonly state: HumanHandoffState;
  readonly sellerId?: string | undefined;
  readonly reason?: string | undefined;
  readonly updatedAt: Date;
}

export interface HumanHandoffTransitionOptions {
  readonly sellerId?: string | undefined;
  readonly reason?: string | undefined;
  readonly updatedAt?: Date | undefined;
}

export interface HumanHandoffFallbackDecision {
  readonly aiContinuityRequired: boolean;
  readonly callRemainsActive: boolean;
  readonly handoffPending: boolean;
  readonly disposition: 'RESUME_AI_CONVERSATION';
  readonly reason: string;
}

export interface HumanHandoffTransitionResult {
  readonly session: HumanHandoffSession;
  readonly canonicalEventName?: string | undefined;
  readonly fallback?: HumanHandoffFallbackDecision | undefined;
}

export function createHumanHandoffSession(callId: string, updatedAt?: Date): HumanHandoffSession {
  return {
    callId,
    state: 'NONE',
    updatedAt: updatedAt ?? new Date(),
  };
}

export function isValidHandoffTransition(
  fromState: HumanHandoffState,
  toState: HumanHandoffState,
): boolean {
  const allowed = ALLOWED_HANDOFF_TRANSITIONS[fromState];
  return allowed ? allowed.has(toState) : false;
}

export function resolveZeroSilenceFallback(
  targetState: 'FAILED' | 'TIMED_OUT' | 'CANCELED',
  reason?: string,
): HumanHandoffFallbackDecision {
  return {
    aiContinuityRequired: true,
    callRemainsActive: true,
    handoffPending: false,
    disposition: 'RESUME_AI_CONVERSATION',
    reason: reason ?? targetState,
  };
}

function validateHandoffTransition(
  session: HumanHandoffSession,
  targetState: HumanHandoffState,
): void {
  if (TERMINAL_HANDOFF_STATES.has(session.state)) {
    throw new InvalidStateTransitionError(
      `Cannot transition from terminal handoff state '${session.state}' to '${targetState}' (callId: ${session.callId})`,
    );
  }

  if (!isValidHandoffTransition(session.state, targetState)) {
    throw new InvalidStateTransitionError(
      `Invalid handoff transition from '${session.state}' to '${targetState}' (callId: ${session.callId})`,
    );
  }
}

function resolveNextHandoffSession(
  session: HumanHandoffSession,
  targetState: HumanHandoffState,
  options?: HumanHandoffTransitionOptions,
): HumanHandoffSession {
  return {
    callId: session.callId,
    state: targetState,
    sellerId: options?.sellerId ?? session.sellerId,
    reason: options?.reason ?? session.reason,
    updatedAt: options?.updatedAt ?? new Date(),
  };
}

function resolveHandoffFallback(
  targetState: HumanHandoffState,
  reason?: string,
): HumanHandoffFallbackDecision | undefined {
  if (!FALLBACK_TRIGGER_STATES.has(targetState)) {
    return undefined;
  }
  return resolveZeroSilenceFallback(targetState as 'FAILED' | 'TIMED_OUT' | 'CANCELED', reason);
}

export function transitionHumanHandoff(
  session: HumanHandoffSession,
  targetState: HumanHandoffState,
  options?: HumanHandoffTransitionOptions,
): HumanHandoffTransitionResult {
  validateHandoffTransition(session, targetState);

  return {
    session: resolveNextHandoffSession(session, targetState, options),
    canonicalEventName: CANONICAL_HANDOFF_EVENTS[targetState],
    fallback: resolveHandoffFallback(targetState, options?.reason),
  };
}
