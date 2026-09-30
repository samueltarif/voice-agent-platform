import type { JevProbabilities, JevRoutingClass } from './jev-routing-types.js';

export const MAX_AUTHORIZED_JEV_CALIBRATION_COST_USD = 0.05;
export const CALIBRATION_CASE_COUNT = 80;
export const PLANNED_CHOICE_REQUESTS = 80;
export const PLANNED_ATOMIC_REQUESTS = 80;
export const TOTAL_PLANNED_CALIBRATION_REQUESTS = 160;

export interface JevChoiceSignalResult {
  readonly predictedClass: JevRoutingClass;
  readonly probabilities: JevProbabilities;
  readonly confidence: number;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly providerModel: string;
}

export interface JevAtomicSignalResult {
  readonly deterministicNoul: number;
  readonly generativeNoul: number;
  readonly securityNoul: number;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly providerModel: string;
}

export interface JevCalibrationCaseResult {
  readonly caseId: string;
  readonly expectedRoutingClass: JevRoutingClass;
  readonly choice: JevChoiceSignalResult | null;
  readonly atomic: JevAtomicSignalResult | null;
  readonly status: 'PASS' | 'FAIL' | 'NOT_EXECUTED';
  readonly safeFailureCategory?: string;
}

export interface NumericDistributionSummary {
  readonly count: number;
  readonly min: number;
  readonly median: number;
  readonly max: number;
  readonly p25: number;
  readonly p75: number;
}

export interface AtomicSignalsByClass {
  readonly deterministicNoul: NumericDistributionSummary;
  readonly generativeNoul: NumericDistributionSummary;
  readonly securityNoul: NumericDistributionSummary;
}

export interface JevCalibrationPhaseASummary {
  readonly benchmarkStatus: 'COMPLETE' | 'PARTIAL' | 'BLOCKED';
  readonly requestedModel: string;
  readonly resolvedModelVersion: string | null;
  readonly modelVersionDrift: boolean;
  readonly totalPlannedCases: number;
  readonly executedCases: number;
  readonly plannedChoiceRequests: number;
  readonly executedChoiceRequests: number;
  readonly plannedAtomicRequests: number;
  readonly executedAtomicRequests: number;
  readonly totalPlannedRequests: number;
  readonly totalExecutedRequests: number;
  readonly retries: 0;
  readonly holdoutRequests: 0;
  readonly choiceRoutingAccuracy: number | null;
  readonly choiceDeterministicPrecision: number | null;
  readonly choiceDeterministicRecall: number | null;
  readonly choiceFalseBypassCount: number;
  readonly choiceFalseBypassRateOverNonDeterministic: number | null;
  readonly choiceFalseBypassRateAmongPredictedBypasses: number | null;
  readonly choiceSecurityMissCount: number;
  readonly choiceSecurityMissRate: number | null;
  readonly choiceUnnecessarySecurityEscalationCount: number;
  readonly atomicSignalsByClass: {
    readonly DETERMINISTIC_CANDIDATE: AtomicSignalsByClass;
    readonly GENERATIVE_REQUIRED: AtomicSignalsByClass;
    readonly SECURITY_ESCALATE: AtomicSignalsByClass;
  } | null;
  readonly choiceLatencyMs: NumericDistributionSummary | null;
  readonly atomicLatencyMs: NumericDistributionSummary | null;
  readonly totalChoiceInputTokens: number | null;
  readonly totalChoiceOutputTokens: number | null;
  readonly totalAtomicInputTokens: number | null;
  readonly totalAtomicOutputTokens: number | null;
  readonly totalInputTokens: number | null;
  readonly totalOutputTokens: number | null;
  readonly totalChoiceCostUsd: number | null;
  readonly totalAtomicCostUsd: number | null;
  readonly totalJevCostUsd: number | null;
  readonly costVerificationStatus: 'VERIFIED' | 'USAGE_NOT_OBSERVED' | 'COST_NOT_VERIFIED';
}
