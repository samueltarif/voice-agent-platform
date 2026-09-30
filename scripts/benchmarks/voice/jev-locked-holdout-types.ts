import type { JevRoutingClass } from './jev-routing-types.js';

export const MAX_AUTHORIZED_HOLDOUT_JEV_COST_USD = 0.01;
export const EXPECTED_HOLDOUT_CASE_COUNT = 40;
export const EXPECTED_HOLDOUT_DETERMINISTIC_COUNT = 12;
export const EXPECTED_HOLDOUT_NON_DETERMINISTIC_COUNT = 28;
export const EXPECTED_HOLDOUT_SECURITY_COUNT = 8;
export const EXPECTED_HOLDOUT_NON_SECURITY_COUNT = 32;

export type HoldoutSafetyCriteriaStatus =
  | 'MET'
  | 'NOT_MET_FALSE_BYPASS'
  | 'NOT_MET_SECURITY_MISS'
  | 'NOT_MET_FALSE_BYPASS_AND_SECURITY_MISS';

export interface HoldoutRawCase {
  readonly caseId: string;
  readonly split: string;
  readonly expectedRoutingClass: JevRoutingClass;
  readonly subtype: string;
  readonly syntheticCallerInput: string;
  readonly evaluationNote: string;
}

export interface HoldoutAtomicSignal {
  readonly deterministicNoul: number;
  readonly generativeNoul: number;
  readonly securityNoul: number;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly providerModel: string;
}

export interface HoldoutCaseResult {
  readonly caseId: string;
  readonly expectedRoutingClass: JevRoutingClass;
  readonly atomic: HoldoutAtomicSignal | null;
  readonly frozenPolicyPrediction: JevRoutingClass | null;
  readonly classificationCorrect: boolean | null;
  readonly status: 'PASS' | 'FAIL' | 'NOT_EXECUTED';
  readonly safeFailureCategory?: string;
}

export interface HoldoutMetricsReport {
  readonly routingAccuracy: number;
  readonly deterministicTruePositiveCount: number;
  readonly deterministicFalsePositiveCount: number;
  readonly deterministicFalseNegativeCount: number;
  readonly deterministicPrecision: number;
  readonly deterministicRecall: number;
  readonly safeBypassCount: number;
  readonly holdoutSafeBypassRateAll: number;
  readonly holdoutDeterministicRecall: number;
  readonly falseBypassCount: number;
  readonly falseBypassRateOverNonDeterministic: number;
  readonly falseBypassRateAmongPredictedBypasses: number;
  readonly securityTruePositiveCount: number;
  readonly securityMissCount: number;
  readonly securityMissRate: number;
  readonly unnecessarySecurityEscalationCount: number;
  readonly unnecessarySecurityEscalationRate: number;
  readonly generativeCorrectCount: number;
}

export interface HoldoutLatencyDistribution {
  readonly min: number;
  readonly median: number;
  readonly max: number;
  readonly p95: number;
}

export interface HoldoutSummary {
  readonly benchmarkStatus: 'COMPLETE' | 'PARTIAL';
  readonly holdoutSafetyCriteria: HoldoutSafetyCriteriaStatus;
  readonly syntheticLockedHoldoutResult: 'CRITERIA_MET' | 'CRITERIA_NOT_MET' | 'PARTIAL_EXECUTION';
  readonly requestedModel: string;
  readonly resolvedModelVersion: string | null;
  readonly modelVersionComparability: 'SAME' | 'CHANGED_FROM_CALIBRATION';
  readonly modelVersionDrift: boolean;
  readonly totalPlannedCases: number;
  readonly executedCases: number;
  readonly plannedRequests: number;
  readonly executedRequests: number;
  readonly calibrationProviderRequests: number;
  readonly retries: number;
  readonly failures: number;
  readonly lockedHoldoutConsumed: boolean;
  readonly totalInputTokens: number | null;
  readonly totalOutputTokens: number | null;
  readonly usageBasedEstimatedCostUsd: number | null;
  readonly latencyDistribution: HoldoutLatencyDistribution | null;
  readonly metrics: HoldoutMetricsReport | null;
}

export interface HoldoutExecutionArtifact {
  readonly metadata: {
    readonly runTimestamp: string;
    readonly datasetVersion: string;
    readonly datasetSha256: string;
    readonly atomicQuestionSetSha256: string;
    readonly frozenPolicySha256: string;
    readonly frozenThresholds: {
      readonly tSecurity: number;
      readonly tDeterministic: number;
      readonly tGenerative: number;
    };
  };
  readonly summary: HoldoutSummary;
  readonly cases: readonly HoldoutCaseResult[];
}
