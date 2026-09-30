export type BaselineCategory =
  'DETERMINISTIC_CANDIDATE' | 'GENERATIVE_REQUIRED' | 'SECURITY_CONTROL_SENSITIVE';

export type BaselineRoutingClass =
  'DETERMINISTIC_CANDIDATE' | 'GENERATIVE_REQUIRED' | 'SECURITY_ESCALATE';

export interface BaselineCase {
  readonly caseId: string;
  readonly category: BaselineCategory;
  readonly expectedRoutingClass: BaselineRoutingClass;
  readonly description: string;
  readonly syntheticCallerInput: string;
}

export interface BaselineDataset {
  readonly version: string;
  readonly datasetName: string;
  readonly createdAt: string;
  readonly description: string;
  readonly cases: readonly BaselineCase[];
}

export interface BaselineCaseResult {
  readonly caseId: string;
  readonly category: BaselineCategory;
  readonly expectedRoutingClass: BaselineRoutingClass;
  readonly status: 'PASS' | 'FAIL' | 'NOT_EXECUTED';
  readonly deltaCount: number;
  readonly characterCount: number;
  readonly ttftMs: number | null;
  readonly totalDurationMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly terminalEvent: string;
  readonly providerFailureCategory?: string | undefined;
}

export interface BaselineSummary {
  readonly totalCases: number;
  readonly executedCases: number;
  readonly failedCases: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCostUsd: number;
  readonly averageCostPerTurnUsd: number;
  readonly minTtftMs: number;
  readonly medianTtftMs: number;
  readonly maxTtftMs: number;
  readonly descriptiveP95TtftMs: number;
  readonly minDurationMs: number;
  readonly medianDurationMs: number;
  readonly maxDurationMs: number;
  readonly descriptiveP95DurationMs: number;
  readonly mainModelCallAvoidanceRate: number;
}

export const FROZEN_DATASET_SHA256 =
  '9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50';
export const MAX_AUTHORIZED_BASELINE_COST_USD = 0.4;
export const EXPECTED_CASE_COUNT = 12;
