/**
 * Offline action for SECURITY_BLOCKED turn decision.
 *
 * Produces a minimal typed decision result indicating the turn was blocked
 * for security reasons. Pure function with zero side effects, zero runtime
 * wiring, and zero external dependencies.
 */

export interface SecurityBlockedResult {
  readonly outcome: 'SECURITY_BLOCKED';
}

export function createSecurityBlockedResult(): SecurityBlockedResult {
  return {
    outcome: 'SECURITY_BLOCKED',
  };
}
