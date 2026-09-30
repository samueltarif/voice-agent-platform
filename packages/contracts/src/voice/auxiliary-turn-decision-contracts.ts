/**
 * Provider-neutral contracts for auxiliary turn decision evaluations.
 *
 * Official TypeSafe Semantics:
 * The model does not generate text; it returns advisory probability scores.
 * Calibrated probabilities are evaluated across groups of predictions.
 * An individual score is NOT a certainty, guarantee, or business authorization.
 * The auxiliary path MUST NOT block or terminate the authoritative conversation path.
 */

export type AuxiliaryTurnFeatureMode = 'DISABLED' | 'SHADOW' | 'ACTIVE_GUARDED';

export interface AuxiliaryTurnDecisionInput {
  readonly organizationId: string;
  readonly callId: string;
  readonly turnId: string;
  readonly callerTranscript: string;
  readonly language?: string | undefined;
  readonly channel?: 'phone' | 'web' | 'unknown' | undefined;
}

export interface AuxiliaryTurnDecisionOutput {
  readonly deterministicScore: number;
  readonly generativeScore: number;
  readonly securityScore: number;
  readonly providerModel: string;
  readonly latencyMs: number;
}

export interface AuxiliaryAbortSignal {
  readonly aborted: boolean;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

export interface AuxiliaryTurnDecisionPort {
  readonly providerName: string;
  evaluateTurn(
    input: AuxiliaryTurnDecisionInput,
    signal?: AuxiliaryAbortSignal,
  ): Promise<AuxiliaryTurnDecisionOutput>;
}

function isValidProbabilityScore(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 1;
}

function validateProbabilityField(val: unknown, fieldName: string): number {
  if (!isValidProbabilityScore(val)) {
    throw new TypeError(`${fieldName} must be a finite number between 0 and 1`);
  }
  return val;
}

function validateProviderModel(model: unknown): string {
  if (typeof model !== 'string' || model.trim().length === 0) {
    throw new TypeError('providerModel must be a non-empty string');
  }
  return model;
}

function validateLatencyMs(latency: unknown): number {
  if (typeof latency !== 'number' || !Number.isFinite(latency) || latency < 0) {
    throw new TypeError('latencyMs must be a non-negative finite number');
  }
  return latency;
}

export function validateAuxiliaryTurnDecisionOutput(raw: unknown): AuxiliaryTurnDecisionOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('Auxiliary turn decision output must be a non-null object');
  }

  const candidate = raw as Record<string, unknown>;

  return {
    deterministicScore: validateProbabilityField(
      candidate.deterministicScore,
      'deterministicScore',
    ),
    generativeScore: validateProbabilityField(candidate.generativeScore, 'generativeScore'),
    securityScore: validateProbabilityField(candidate.securityScore, 'securityScore'),
    providerModel: validateProviderModel(candidate.providerModel),
    latencyMs: validateLatencyMs(candidate.latencyMs),
  };
}
