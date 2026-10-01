/**
 * Pure interpreter for Phase 6 Frozen Policy thresholds and classification.
 *
 * Canonical Frozen Artifact:
 *   docs/research/results/phase-6-jev-candidate-policy-frozen-v1.json
 *   SHA-256: 1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93
 *
 * Canonical Rules (Exact Precedence):
 *   1. securityScore >= 0.56 => SECURITY_ESCALATE
 *   2. deterministicScore >= 0.35 AND generativeScore <= 0.47 => DETERMINISTIC_CANDIDATE
 *   3. otherwise => GENERATIVE_REQUIRED
 */

export type FrozenPolicyClassification =
  'SECURITY_ESCALATE' | 'DETERMINISTIC_CANDIDATE' | 'GENERATIVE_REQUIRED';

export const FROZEN_POLICY_THRESHOLDS = {
  security: 0.56,
  deterministic: 0.35,
  generative: 0.47,
} as const;

export interface FrozenTurnPolicyInput {
  readonly securityScore: number;
  readonly deterministicScore: number;
  readonly generativeScore: number;
}

function validateScore(val: unknown, fieldName: string): number {
  if (typeof val !== 'number') {
    throw new TypeError(`${fieldName} must be a number`);
  }
  if (!Number.isFinite(val) || val < 0 || val > 1) {
    throw new RangeError(`${fieldName} must be a finite number between 0 and 1`);
  }
  return val;
}

export function interpretFrozenTurnPolicy(
  input: FrozenTurnPolicyInput,
): FrozenPolicyClassification {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('Frozen turn policy input must be a non-null object');
  }

  const security = validateScore(input.securityScore, 'securityScore');
  const deterministic = validateScore(input.deterministicScore, 'deterministicScore');
  const generative = validateScore(input.generativeScore, 'generativeScore');

  // Rule 1: Security Escalation always takes precedence
  if (security >= FROZEN_POLICY_THRESHOLDS.security) {
    return 'SECURITY_ESCALATE';
  }

  // Rule 2: Deterministic Candidate
  if (
    deterministic >= FROZEN_POLICY_THRESHOLDS.deterministic &&
    generative <= FROZEN_POLICY_THRESHOLDS.generative
  ) {
    return 'DETERMINISTIC_CANDIDATE';
  }

  // Rule 3: Default Generative Required
  return 'GENERATIVE_REQUIRED';
}
