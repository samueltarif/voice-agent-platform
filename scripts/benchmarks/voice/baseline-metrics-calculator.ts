import type {
  BaselineCaseResult,
  BaselineSummary,
  BenchmarkExecutionStatus,
} from './baseline-types.js';

export const OPENAI_INPUT_COST_PER_MILLION = 10.0;
export const OPENAI_OUTPUT_COST_PER_MILLION = 50.0;

export function calculateTurnCostUsd(
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (inputTokens === null || outputTokens === null) {
    return null;
  }
  return (
    (inputTokens * OPENAI_INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OPENAI_OUTPUT_COST_PER_MILLION) / 1_000_000
  );
}

function calculatePercentile(sortedValues: readonly number[], percentile: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? null;
}

function calculateMedian(sortedValues: readonly number[]): number | null {
  if (sortedValues.length === 0) return null;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 !== 0) {
    return sortedValues[mid] ?? null;
  }
  const low = sortedValues[mid - 1] ?? 0;
  const high = sortedValues[mid] ?? 0;
  return Math.round((low + high) / 2);
}

function resolveBenchmarkStatus(
  executedCount: number,
  failedCount: number,
  totalExpected: number,
): BenchmarkExecutionStatus {
  if (executedCount === 0 && failedCount === 0) {
    return 'NOT_EXECUTED';
  }
  if (executedCount === totalExpected && failedCount === 0) {
    return 'COMPLETE';
  }
  return 'PARTIAL';
}

export function computeBaselineSummary(
  results: readonly BaselineCaseResult[],
  totalCasesExpected: number,
): BaselineSummary {
  const executed = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');
  const benchmarkStatus = resolveBenchmarkStatus(
    executed.length,
    failed.length,
    totalCasesExpected,
  );

  const mainModelRequests = executed.length + failed.length;
  const mainModelCallAvoidanceRate = benchmarkStatus === 'COMPLETE' ? 0.0 : null;

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

  const knownPartialCostUsd = executed.reduce((acc, r) => acc + (r.estimatedCostUsd ?? 0), 0);
  const totalCostUsd = executed.length > 0 && !hasMissingCost ? knownPartialCostUsd : null;

  const averageCostPerTurnUsd =
    totalCostUsd !== null && executed.length > 0 ? totalCostUsd / executed.length : null;

  const validTtfts = executed
    .map((r) => r.ttftMs)
    .filter((t): t is number => typeof t === 'number')
    .sort((a, b) => a - b);

  const durations = executed.map((r) => r.totalDurationMs).sort((a, b) => a - b);

  return {
    benchmarkStatus,
    totalCases: totalCasesExpected,
    executedCases: executed.length,
    failedCases: failed.length,
    mainModelRequests,
    mainModelCallAvoidanceRate,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    knownPartialCostUsd,
    averageCostPerTurnUsd,
    minTtftMs: validTtfts.length > 0 ? (validTtfts[0] ?? null) : null,
    medianTtftMs: calculateMedian(validTtfts),
    maxTtftMs: validTtfts.length > 0 ? (validTtfts[validTtfts.length - 1] ?? null) : null,
    descriptiveP95TtftMs: calculatePercentile(validTtfts, 95),
    minDurationMs: durations.length > 0 ? (durations[0] ?? null) : null,
    medianDurationMs: calculateMedian(durations),
    maxDurationMs: durations.length > 0 ? (durations[durations.length - 1] ?? null) : null,
    descriptiveP95DurationMs: calculatePercentile(durations, 95),
  };
}
