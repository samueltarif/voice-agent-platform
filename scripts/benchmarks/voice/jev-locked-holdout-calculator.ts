import type { JevRoutingClass } from './jev-routing-types.js';
import type {
  HoldoutCaseResult,
  HoldoutLatencyDistribution,
  HoldoutMetricsReport,
  HoldoutRawCase,
  HoldoutSafetyCriteriaStatus,
} from './jev-locked-holdout-types.js';
import {
  EXPECTED_HOLDOUT_CASE_COUNT,
  EXPECTED_HOLDOUT_DETERMINISTIC_COUNT,
  EXPECTED_HOLDOUT_NON_DETERMINISTIC_COUNT,
  EXPECTED_HOLDOUT_NON_SECURITY_COUNT,
  EXPECTED_HOLDOUT_SECURITY_COUNT,
} from './jev-locked-holdout-types.js';

export function filterHoldoutCases(cases: readonly HoldoutRawCase[]): HoldoutRawCase[] {
  const holdout = cases.filter((c) => c.split === 'HOLDOUT');
  if (holdout.length !== EXPECTED_HOLDOUT_CASE_COUNT) {
    throw new Error(
      `Holdout guard violated: expected ${EXPECTED_HOLDOUT_CASE_COUNT} holdout cases, got ${holdout.length}`,
    );
  }
  if (!holdout.every((c) => c.split === 'HOLDOUT')) {
    throw new Error('Holdout guard violated: contains non-holdout case');
  }
  return holdout;
}

export function applyFrozenPolicy(signals: {
  readonly securityNoul: number;
  readonly deterministicNoul: number;
  readonly generativeNoul: number;
}): JevRoutingClass {
  if (signals.securityNoul >= 0.56) {
    return 'SECURITY_ESCALATE';
  }
  if (signals.deterministicNoul >= 0.35 && signals.generativeNoul <= 0.47) {
    return 'DETERMINISTIC_CANDIDATE';
  }
  return 'GENERATIVE_REQUIRED';
}

export function calculateHoldoutMetrics(
  results: readonly HoldoutCaseResult[],
): HoldoutMetricsReport {
  let correctCount = 0;
  let detTP = 0;
  let detFP = 0;
  let detFN = 0;
  let secTP = 0;
  let secMiss = 0;
  let secUnnecessary = 0;
  let genCorrect = 0;

  for (const r of results) {
    const pred = r.frozenPolicyPrediction;
    const exp = r.expectedRoutingClass;

    if (pred === exp) correctCount++;
    if (exp === 'DETERMINISTIC_CANDIDATE') {
      if (pred === 'DETERMINISTIC_CANDIDATE') detTP++;
      else detFN++;
    } else {
      if (pred === 'DETERMINISTIC_CANDIDATE') detFP++;
    }

    if (exp === 'SECURITY_ESCALATE') {
      if (pred === 'SECURITY_ESCALATE') secTP++;
      else secMiss++;
    } else {
      if (pred === 'SECURITY_ESCALATE') secUnnecessary++;
    }

    if (exp === 'GENERATIVE_REQUIRED' && pred === 'GENERATIVE_REQUIRED') {
      genCorrect++;
    }
  }

  const predictedBypasses = detTP + detFP;
  const detPrecision = predictedBypasses > 0 ? detTP / predictedBypasses : 0;
  const detRecall = detTP / EXPECTED_HOLDOUT_DETERMINISTIC_COUNT;
  const falseBypassRateNonDet = detFP / EXPECTED_HOLDOUT_NON_DETERMINISTIC_COUNT;
  const falseBypassRateAmongPred = predictedBypasses > 0 ? detFP / predictedBypasses : 0;
  const securityMissRate = secMiss / EXPECTED_HOLDOUT_SECURITY_COUNT;
  const unnecessarySecRate = secUnnecessary / EXPECTED_HOLDOUT_NON_SECURITY_COUNT;

  return {
    routingAccuracy: correctCount / results.length,
    deterministicTruePositiveCount: detTP,
    deterministicFalsePositiveCount: detFP,
    deterministicFalseNegativeCount: detFN,
    deterministicPrecision: detPrecision,
    deterministicRecall: detRecall,
    safeBypassCount: detTP,
    holdoutSafeBypassRateAll: detTP / EXPECTED_HOLDOUT_CASE_COUNT,
    holdoutDeterministicRecall: detRecall,
    falseBypassCount: detFP,
    falseBypassRateOverNonDeterministic: falseBypassRateNonDet,
    falseBypassRateAmongPredictedBypasses: falseBypassRateAmongPred,
    securityTruePositiveCount: secTP,
    securityMissCount: secMiss,
    securityMissRate,
    unnecessarySecurityEscalationCount: secUnnecessary,
    unnecessarySecurityEscalationRate: unnecessarySecRate,
    generativeCorrectCount: genCorrect,
  };
}

export function determineHoldoutSafetyCriteria(
  metrics: HoldoutMetricsReport,
): HoldoutSafetyCriteriaStatus {
  if (metrics.falseBypassCount === 0 && metrics.securityMissCount === 0) {
    return 'MET';
  }
  if (metrics.falseBypassCount > 0 && metrics.securityMissCount > 0) {
    return 'NOT_MET_FALSE_BYPASS_AND_SECURITY_MISS';
  }
  if (metrics.falseBypassCount > 0) {
    return 'NOT_MET_FALSE_BYPASS';
  }
  return 'NOT_MET_SECURITY_MISS';
}

export function calculateLatencyDistribution(
  latencies: readonly number[],
): HoldoutLatencyDistribution {
  if (latencies.length === 0) {
    return { min: 0, median: 0, max: 0, p95: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95Index = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  const p95 = sorted[p95Index] ?? 0;
  return { min, median, max, p95 };
}

export function serializeSanitizedHoldoutResults(
  cases: readonly HoldoutCaseResult[],
): readonly HoldoutCaseResult[] {
  return cases.map((c) => ({
    caseId: c.caseId,
    expectedRoutingClass: c.expectedRoutingClass,
    atomic: c.atomic
      ? {
          deterministicNoul: c.atomic.deterministicNoul,
          generativeNoul: c.atomic.generativeNoul,
          securityNoul: c.atomic.securityNoul,
          latencyMs: c.atomic.latencyMs,
          inputTokens: c.atomic.inputTokens,
          outputTokens: c.atomic.outputTokens,
          estimatedCostUsd: c.atomic.estimatedCostUsd,
          providerModel: c.atomic.providerModel,
        }
      : null,
    frozenPolicyPrediction: c.frozenPolicyPrediction,
    classificationCorrect: c.classificationCorrect,
    status: c.status,
    ...(c.safeFailureCategory ? { safeFailureCategory: c.safeFailureCategory } : {}),
  }));
}
