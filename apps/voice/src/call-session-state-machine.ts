import type { CallSession, CallSessionState } from '@voice-agent/contracts';
import {
  TERMINAL_CALL_SESSION_STATES,
  isValidCallSessionStateTransition,
} from '@voice-agent/contracts';
import { InvalidStateTransitionError } from '@voice-agent/errors';

export interface TransitionOptions {
  readonly failureReason?: string;
  readonly endedAt?: Date;
}

export function isValidCallSessionTransition(
  fromState: CallSessionState,
  toState: CallSessionState,
): boolean {
  return isValidCallSessionStateTransition(fromState, toState);
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
