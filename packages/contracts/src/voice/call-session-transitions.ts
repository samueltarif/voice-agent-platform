import type { CallSessionState } from './call-session-contracts.js';

/**
 * Fonte única das transições de `CallSessionState`, compartilhada pelo runtime
 * de voz (memória) e pela persistência durável (PostgreSQL). Sessão ACTIVE
 * significa chamada conectada; aceite de originação NÃO implica ACTIVE.
 */
export const CALL_SESSION_STATE_TRANSITIONS: Readonly<
  Record<CallSessionState, ReadonlySet<CallSessionState>>
> = {
  CREATED: new Set<CallSessionState>(['CONNECTING', 'FAILED']),
  CONNECTING: new Set<CallSessionState>(['ACTIVE', 'FAILED']),
  ACTIVE: new Set<CallSessionState>(['ENDING', 'FAILED']),
  ENDING: new Set<CallSessionState>(['ENDED', 'FAILED']),
  ENDED: new Set<CallSessionState>(),
  FAILED: new Set<CallSessionState>(),
};

export function isValidCallSessionStateTransition(
  fromState: CallSessionState,
  toState: CallSessionState,
): boolean {
  const allowed = CALL_SESSION_STATE_TRANSITIONS[fromState];
  return allowed ? allowed.has(toState) : false;
}
