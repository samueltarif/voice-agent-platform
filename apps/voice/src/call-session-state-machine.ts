import type { CallSession, CallSessionState } from '@voice-agent/contracts';
import { TERMINAL_CALL_SESSION_STATES } from '@voice-agent/contracts';
import { InvalidStateTransitionError } from '@voice-agent/errors';

const ALLOWED_TRANSITIONS: Readonly<Record<CallSessionState, ReadonlySet<CallSessionState>>> = {
  CREATED: new Set<CallSessionState>(['CONNECTING', 'FAILED']),
  CONNECTING: new Set<CallSessionState>(['ACTIVE', 'FAILED']),
  ACTIVE: new Set<CallSessionState>(['ENDING', 'FAILED']),
  ENDING: new Set<CallSessionState>(['ENDED', 'FAILED']),
  ENDED: new Set<CallSessionState>(),
  FAILED: new Set<CallSessionState>(),
};

export interface TransitionOptions {
  readonly failureReason?: string;
  readonly endedAt?: Date;
}

export function isValidCallSessionTransition(
  fromState: CallSessionState,
  toState: CallSessionState,
): boolean {
  const allowed = ALLOWED_TRANSITIONS[fromState];
  return allowed ? allowed.has(toState) : false;
}

export function transitionCallSession(
  session: CallSession,
  targetState: CallSessionState,
  options?: TransitionOptions,
): CallSession {
  if (TERMINAL_CALL_SESSION_STATES.has(session.runtimeState)) {
    throw new InvalidStateTransitionError(
      `Cannot transition from terminal call state '${session.runtimeState}' to '${targetState}' (callId: ${session.callId})`,
    );
  }

  if (!isValidCallSessionTransition(session.runtimeState, targetState)) {
    throw new InvalidStateTransitionError(
      `Invalid call transition from '${session.runtimeState}' to '${targetState}' (callId: ${session.callId})`,
    );
  }

  const isTerminal = TERMINAL_CALL_SESSION_STATES.has(targetState);
  const endedAt = isTerminal ? (options?.endedAt ?? new Date()) : session.endedAt;

  return {
    ...session,
    runtimeState: targetState,
    endedAt,
    ...(options?.failureReason ? { failureReason: options.failureReason } : {}),
  };
}

export function transitionToTerminalSession(
  session: CallSession,
  targetState: 'ENDED' | 'FAILED',
  failureReason?: string,
): CallSession {
  const failOpt = failureReason !== undefined ? { failureReason } : undefined;
  const isEnding = targetState === 'ENDED' && session.runtimeState === 'ACTIVE';
  const base = isEnding ? transitionCallSession(session, 'ENDING') : session;
  return transitionCallSession(base, targetState, failOpt);
}
