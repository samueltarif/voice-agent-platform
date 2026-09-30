import type { BaselineCaseResult, BaselineSummary } from './baseline-types.js';

export const OPENAI_INPUT_COST_PER_MILLION = 10.0;
export const OPENAI_OUTPUT_COST_PER_MILLION = 50.0;

export function calculateTurnCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * OPENAI_INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OPENAI_OUTPUT_COST_PER_MILLION) / 1_000_000
  );
}

function calculatePercentile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0;
}

function calculateMedian(sortedValues: readonly number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 !== 0) {
    return sortedValues[mid] ?? 0;
  }
  const low = sortedValues[mid - 1] ?? 0;
  const high = sortedValues[mid] ?? 0;
  return Math.round((low + high) / 2);
}

export function computeBaselineSummary(
  results: readonly BaselineCaseResult[],
  totalCasesExpected: number,
): BaselineSummary {
  const executed = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');

  const totalInputTokens = executed.reduce((acc, r) => acc + r.inputTokens, 0);
  const totalOutputTokens = executed.reduce((acc, r) => acc + r.outputTokens, 0);
  const totalCostUsd = executed.reduce((acc, r) => acc + r.estimatedCostUsd, 0);
  const averageCostPerTurnUsd = executed.length > 0 ? totalCostUsd / executed.length : 0;

  const validTtfts = executed
    .map((r) => r.ttftMs)
    .filter((t): t is number => typeof t === 'number')
    .sort((a, b) => a - b);

  const durations = executed.map((r) => r.totalDurationMs).sort((a, b) => a - b);

  const minTtftMs = validTtfts.length > 0 ? (validTtfts[0] ?? 0) : 0;
  const maxTtftMs = validTtfts.length > 0 ? (validTtfts[validTtfts.length - 1] ?? 0) : 0;
  const medianTtftMs = calculateMedian(validTtfts);
  const descriptiveP95TtftMs = calculatePercentile(validTtfts, 95);

  const minDurationMs = durations.length > 0 ? (durations[0] ?? 0) : 0;
  const maxDurationMs = durations.length > 0 ? (durations[durations.length - 1] ?? 0) : 0;
  const medianDurationMs = calculateMedian(durations);
  const descriptiveP95DurationMs = calculatePercentile(durations, 95);

  return {
    totalCases: totalCasesExpected,
    executedCases: executed.length,
    failedCases: failed.length,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    averageCostPerTurnUsd,
    minTtftMs,
    medianTtftMs,
    maxTtftMs,
    descriptiveP95TtftMs,
    minDurationMs,
    medianDurationMs,
    maxDurationMs,
    descriptiveP95DurationMs,
    mainModelCallAvoidanceRate: 0.0,
  };
}
