export type CalibrationRoutingClass =
  'DETERMINISTIC_CANDIDATE' | 'GENERATIVE_REQUIRED' | 'SECURITY_ESCALATE';

export interface CandidateCaseInput {
  readonly caseId: string;
  readonly expectedRoutingClass: CalibrationRoutingClass;
  readonly atomic: {
    readonly deterministicNoul: number;
    readonly generativeNoul: number;
    readonly securityNoul: number;
  };
}

export interface PolicyThresholdTriple {
  readonly tSecurity: number;
  readonly tDeterministic: number;
  readonly tGenerative: number;
}

export interface PolicyEvaluationMetrics {
  readonly routingAccuracy: number;
  readonly deterministicTruePositiveCount: number;
  readonly deterministicFalsePositiveCount: number;
  readonly deterministicFalseNegativeCount: number;
  readonly deterministicPrecision: number;
  readonly deterministicRecall: number;
  readonly safeBypassCount: number;
  readonly falseBypassCount: number;
  readonly falseBypassRateOverNonDeterministic: number;
  readonly falseBypassRateAmongPredictedBypasses: number;
  readonly securityTruePositiveCount: number;
  readonly securityMissCount: number;
  readonly securityMissRate: number;
  readonly unnecessarySecurityEscalationCount: number;
  readonly unnecessarySecurityEscalationRate: number;
}

export interface PolicyThresholdRange {
  readonly min: number;
  readonly max: number;
}

export interface EquivalentPredictionRegion {
  readonly regionId: string;
  readonly tripleCount: number;
  readonly tSecurityRange: PolicyThresholdRange;
  readonly tDeterministicRange: PolicyThresholdRange;
  readonly tGenerativeRange: PolicyThresholdRange;
  readonly metrics: PolicyEvaluationMetrics;
  readonly representativeTriple: PolicyThresholdTriple;
}

export interface StabilityMarginReport {
  readonly securityNearestEscalateMin: number;
  readonly securityNearestNonEscalateMax: number;
  readonly securityMarginGap: number;
  readonly deterministicNearestBypassMin: number;
  readonly deterministicNearestNonBypassMax: number;
  readonly generativeNearestBypassMax: number;
  readonly generativeNearestNonBypassMin: number;
}

export interface CandidatePolicyFitResult {
  readonly benchmark: string;
  readonly fitTimestamp: string;
  readonly phaseAArtifactSha256: string;
  readonly totalCalibrationCases: number;
  readonly thresholdCandidateCounts: {
    readonly security: number;
    readonly deterministic: number;
    readonly generative: number;
    readonly totalCombinations: number;
  };
  readonly feasiblePolicyCount: number;
  readonly bestEquivalentRegionsCount: number;
  readonly bestRegion: EquivalentPredictionRegion;
  readonly missedCaseIds: readonly string[];
  readonly stabilityMargin: StabilityMarginReport;
  readonly choiceBaselineComparison: {
    readonly choiceAccuracy: number;
    readonly choiceDeterministicPrecision: number;
    readonly choiceDeterministicRecall: number;
    readonly choiceFalseBypassRateAmongPredicted: number;
    readonly candidateAccuracy: number;
    readonly candidateDeterministicPrecision: number;
    readonly candidateDeterministicRecall: number;
    readonly candidateFalseBypassRateAmongPredicted: number;
  };
  readonly calibrationSafeBypassRate: number;
  readonly calibrationCounterfactualMainModelRequests: number;
  readonly status: 'CALIBRATION_CANDIDATE_REGION_FOUND' | 'NO_ZERO_FALSE_BYPASS_CANDIDATE_FOUND';
  readonly candidatePolicySelected: 'NO';
  readonly policyFrozen: 'NO';
  readonly holdoutEvaluated: 'NO';
}
