import { createHash } from 'node:crypto';

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
  readonly candidatePolicySelected: 'NO' | 'YES';
  readonly policyFrozen: 'NO' | 'YES';
  readonly holdoutEvaluated: 'NO';
}

export interface FrozenPolicyCanonicalDefinition {
  readonly policyVersion: string;
  readonly family: 'THREE_THRESHOLD_ORDERED_RULE';
  readonly rules: readonly [
    {
      readonly order: 1;
      readonly ruleId: 'RULE_1_SECURITY_ESCALATE';
      readonly condition: {
        readonly signal: 'securityNoul';
        readonly operator: '>=';
        readonly threshold: number;
      };
      readonly targetRoutingClass: 'SECURITY_ESCALATE';
    },
    {
      readonly order: 2;
      readonly ruleId: 'RULE_2_DETERMINISTIC_CANDIDATE';
      readonly condition: {
        readonly all: readonly [
          {
            readonly signal: 'deterministicNoul';
            readonly operator: '>=';
            readonly threshold: number;
          },
          {
            readonly signal: 'generativeNoul';
            readonly operator: '<=';
            readonly threshold: number;
          },
        ];
      };
      readonly targetRoutingClass: 'DETERMINISTIC_CANDIDATE';
    },
    {
      readonly order: 3;
      readonly ruleId: 'RULE_3_GENERATIVE_FALLBACK';
      readonly condition: 'DEFAULT';
      readonly targetRoutingClass: 'GENERATIVE_REQUIRED';
    },
  ];
}

export const FROZEN_CANDIDATE_POLICY_DEFINITION: FrozenPolicyCanonicalDefinition = {
  policyVersion: '1.0.0',
  family: 'THREE_THRESHOLD_ORDERED_RULE',
  rules: [
    {
      order: 1,
      ruleId: 'RULE_1_SECURITY_ESCALATE',
      condition: { signal: 'securityNoul', operator: '>=', threshold: 0.56 },
      targetRoutingClass: 'SECURITY_ESCALATE',
    },
    {
      order: 2,
      ruleId: 'RULE_2_DETERMINISTIC_CANDIDATE',
      condition: {
        all: [
          { signal: 'deterministicNoul', operator: '>=', threshold: 0.35 },
          { signal: 'generativeNoul', operator: '<=', threshold: 0.47 },
        ],
      },
      targetRoutingClass: 'DETERMINISTIC_CANDIDATE',
    },
    {
      order: 3,
      ruleId: 'RULE_3_GENERATIVE_FALLBACK',
      condition: 'DEFAULT',
      targetRoutingClass: 'GENERATIVE_REQUIRED',
    },
  ],
} as const;

export const FROZEN_POLICY_SHA256 = createHash('sha256')
  .update(Buffer.from(JSON.stringify(FROZEN_CANDIDATE_POLICY_DEFINITION), 'utf8'))
  .digest('hex');
