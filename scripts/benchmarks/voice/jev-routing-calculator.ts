import { computeJevConfusionMatrix } from './jev-routing-confusion-matrix.js';
import type { JevCaseResult, JevRoutingSummary } from './jev-routing-types.js';
import {
  FROZEN_OPENAI_BASELINE_TOTAL_COST_USD,
  FROZEN_OPENAI_PER_CASE_COSTS_USD,
  TYPESAFE_INPUT_COST_PER_MILLION,
} from './jev-routing-types.js';

export function calculateJevCostUsd(inputTokens: number | null): number | null {
  if (inputTokens === null) return null;
  return (inputTokens * TYPESAFE_INPUT_COST_PER_MILLION) / 1_000_000;
}

function calculateMedian(sortedValues: readonly number[]): number | null {
  if (sortedValues.length === 0) return null;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 !== 0) return sortedValues[mid] ?? null;
  return Math.round(((sortedValues[mid - 1] ?? 0) + (sortedValues[mid] ?? 0)) / 2);
}

function calculatePercentile(sortedValues: readonly number[], percentile: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? null;
}

export function computeJevRoutingSummary(
  results: readonly JevCaseResult[],
  totalCasesExpected: number,
): JevRoutingSummary {
  const executed = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');
  const isComplete = executed.length === totalCasesExpected && failed.length === 0;
  const benchmarkStatus =
    executed.length === 0 && failed.length === 0
      ? 'NOT_EXECUTED'
      : isComplete
        ? 'COMPLETE'
        : 'PARTIAL';

  const correctCount = executed.filter((r) => r.jevChoice === r.expectedRoutingClass).length;
  const predDet = executed.filter((r) => r.jevChoice === 'DETERMINISTIC_CANDIDATE');
  const correctDet = predDet.filter(
    (r) => r.expectedRoutingClass === 'DETERMINISTIC_CANDIDATE',
  ).length;

  const falseBypassCount = executed.filter(
    (r) =>
      r.jevChoice === 'DETERMINISTIC_CANDIDATE' &&
      r.expectedRoutingClass !== 'DETERMINISTIC_CANDIDATE',
  ).length;

  const securityMissCount = executed.filter(
    (r) => r.expectedRoutingClass === 'SECURITY_ESCALATE' && r.jevChoice !== 'SECURITY_ESCALATE',
  ).length;

  const unnecessarySecurityEscalationCount = executed.filter(
    (r) => r.jevChoice === 'SECURITY_ESCALATE' && r.expectedRoutingClass !== 'SECURITY_ESCALATE',
  ).length;

  const safePotentialAvoidedCalls = correctDet;
  const candidateBypassCount = predDet.length;

  let potentialOpenAiCostAvoidedUsd = 0;
  for (const r of executed) {
    if (
      r.expectedRoutingClass === 'DETERMINISTIC_CANDIDATE' &&
      r.jevChoice === 'DETERMINISTIC_CANDIDATE'
    ) {
      potentialOpenAiCostAvoidedUsd += FROZEN_OPENAI_PER_CASE_COSTS_USD[r.caseId] ?? 0;
    }
  }

  const hasMissingInput = executed.some((r) => r.inputTokens === null);
  const hasMissingOutput = executed.some((r) => r.outputTokens === null);
  const hasMissingCost = executed.some((r) => r.estimatedCostUsd === null);

  const totalInputTokens =
    executed.length > 0 && !hasMissingInput
      ? executed.reduce((acc, r) => acc + (r.inputTokens ?? 0), 0)
      : null;
  const totalOutputTokens =
    executed.length > 0 && !hasMissingOutput
      ? executed.reduce((acc, r) => acc + (r.outputTokens ?? 0), 0)
      : null;
  const totalJevCostUsd =
    executed.length > 0 && !hasMissingCost
      ? executed.reduce((acc, r) => acc + (r.estimatedCostUsd ?? 0), 0)
      : null;

  let counterfactualCombinedCostUsd: number | null = null;
  let counterfactualCostReductionUsd: number | null = null;
  let counterfactualCostReductionPercent: number | null = null;

  if (isComplete && totalJevCostUsd !== null) {
    counterfactualCombinedCostUsd =
      FROZEN_OPENAI_BASELINE_TOTAL_COST_USD - potentialOpenAiCostAvoidedUsd + totalJevCostUsd;
    counterfactualCostReductionUsd =
      FROZEN_OPENAI_BASELINE_TOTAL_COST_USD - counterfactualCombinedCostUsd;
    counterfactualCostReductionPercent =
      counterfactualCostReductionUsd / FROZEN_OPENAI_BASELINE_TOTAL_COST_USD;
  }

  const validLatencies = executed
    .map((r) => r.jevLatencyMs)
    .filter((l): l is number => typeof l === 'number')
    .sort((a, b) => a - b);

  return {
    benchmarkStatus,
    totalCases: totalCasesExpected,
    executedCases: executed.length,
    failedCases: failed.length,
    routingAccuracy: isComplete ? correctCount / totalCasesExpected : null,
    confusionMatrix: computeJevConfusionMatrix(results),
    deterministicPrecision: predDet.length > 0 ? correctDet / predDet.length : null,
    deterministicRecall: isComplete ? correctDet / 4 : null,
    falseBypassCount,
    falseBypassRate: isComplete ? falseBypassCount / 8 : null,
    securityMissCount,
    securityMissRate: isComplete ? securityMissCount / 2 : null,
    unnecessarySecurityEscalationCount,
    unnecessarySecurityEscalationRate: isComplete ? unnecessarySecurityEscalationCount / 10 : null,
    candidateBypassCount,
    safePotentialAvoidedCalls,
    unsafeFalseBypasses: candidateBypassCount - safePotentialAvoidedCalls,
    potentialSafeMainModelAvoidanceRate: isComplete
      ? safePotentialAvoidedCalls / totalCasesExpected
      : null,
    baselineMainModelRequests: totalCasesExpected,
    jevRequests: executed.length,
    counterfactualMainModelRequests: isComplete
      ? totalCasesExpected - safePotentialAvoidedCalls
      : null,
    counterfactualTotalProviderRequests: isComplete
      ? executed.length + (totalCasesExpected - safePotentialAvoidedCalls)
      : null,
    potentialOpenAiCostAvoidedUsd,
    totalInputTokens,
    totalOutputTokens,
    totalJevCostUsd,
    counterfactualCombinedCostUsd,
    counterfactualCostReductionUsd,
    counterfactualCostReductionPercent,
    minLatencyMs: validLatencies.length > 0 ? (validLatencies[0] ?? null) : null,
    medianLatencyMs: calculateMedian(validLatencies),
    maxLatencyMs:
      validLatencies.length > 0 ? (validLatencies[validLatencies.length - 1] ?? null) : null,
    descriptiveP95LatencyMs: calculatePercentile(validLatencies, 95),
    serialE2eLatency: 'NOT MEASURED',
  };
}
