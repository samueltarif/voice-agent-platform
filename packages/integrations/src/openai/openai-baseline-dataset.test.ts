import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateTurnCostUsd,
  computeBaselineSummary,
} from '../../../../scripts/benchmarks/voice/baseline-metrics-calculator.js';
import type {
  BaselineCaseResult,
  BaselineDataset,
} from '../../../../scripts/benchmarks/voice/baseline-types.js';
import { FROZEN_DATASET_SHA256 } from '../../../../scripts/benchmarks/voice/baseline-types.js';

describe('OpenAI Conversation Baseline Dataset & Metrics Validation', () => {
  const datasetPath = resolve('scripts/benchmarks/voice/openai-baseline-v1-cases.json');

  it('validates the frozen dataset file integrity and SHA-256 hash', () => {
    const content = readFileSync(datasetPath, 'utf8');
    const actualHash = createHash('sha256').update(content).digest('hex');

    expect(actualHash).toBe(FROZEN_DATASET_SHA256);
  });

  it('verifies dataset structure and category distribution (4 / 6 / 2)', () => {
    const content = readFileSync(datasetPath, 'utf8');
    const dataset = JSON.parse(content) as BaselineDataset;

    expect(dataset.version).toBe('1.0.0');
    expect(dataset.datasetName).toBe('openai-conversation-baseline-v1');
    expect(dataset.cases).toHaveLength(12);

    const deterministic = dataset.cases.filter((c) => c.category === 'DETERMINISTIC_CANDIDATE');
    const generative = dataset.cases.filter((c) => c.category === 'GENERATIVE_REQUIRED');
    const security = dataset.cases.filter((c) => c.category === 'SECURITY_CONTROL_SENSITIVE');

    expect(deterministic).toHaveLength(4);
    expect(generative).toHaveLength(6);
    expect(security).toHaveLength(2);

    for (const c of dataset.cases) {
      expect(c.caseId).toMatch(/^base-\d{2}$/);
      expect(c.syntheticCallerInput.trim().length).toBeGreaterThan(5);
      expect(c.description.trim().length).toBeGreaterThan(5);
    }
  });

  it('correctly calculates turn cost using official pricing snapshot', () => {
    // 100 input tokens ($10/1M) = 0.001 USD
    // 50 output tokens ($50/1M) = 0.0025 USD
    const cost = calculateTurnCostUsd(100, 50);
    expect(cost).toBeCloseTo(0.0035, 6);
  });

  it('computes baseline summary metrics, medians and percentiles deterministically', () => {
    const mockResults: BaselineCaseResult[] = [
      {
        caseId: 'base-01',
        category: 'DETERMINISTIC_CANDIDATE',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        status: 'PASS',
        deltaCount: 3,
        characterCount: 15,
        ttftMs: 1200,
        totalDurationMs: 1500,
        inputTokens: 50,
        outputTokens: 10,
        estimatedCostUsd: calculateTurnCostUsd(50, 10),
        terminalEvent: 'completed',
      },
      {
        caseId: 'base-02',
        category: 'GENERATIVE_REQUIRED',
        expectedRoutingClass: 'GENERATIVE_REQUIRED',
        status: 'PASS',
        deltaCount: 5,
        characterCount: 40,
        ttftMs: 2400,
        totalDurationMs: 2800,
        inputTokens: 80,
        outputTokens: 25,
        estimatedCostUsd: calculateTurnCostUsd(80, 25),
        terminalEvent: 'completed',
      },
    ];

    const summary = computeBaselineSummary(mockResults, 2);
    expect(summary.benchmarkStatus).toBe('COMPLETE');
    expect(summary.totalCases).toBe(2);
    expect(summary.executedCases).toBe(2);
    expect(summary.failedCases).toBe(0);
    expect(summary.totalInputTokens).toBe(130);
    expect(summary.totalOutputTokens).toBe(35);
    expect(summary.minTtftMs).toBe(1200);
    expect(summary.maxTtftMs).toBe(2400);
    expect(summary.medianTtftMs).toBe(1800);
    expect(summary.mainModelCallAvoidanceRate).toBe(0.0);
  });

  it('marks unexecuted benchmark as NOT_EXECUTED and avoidance as null (NOT MEASURED)', () => {
    const summary = computeBaselineSummary([], 12);
    expect(summary.benchmarkStatus).toBe('NOT_EXECUTED');
    expect(summary.executedCases).toBe(0);
    expect(summary.failedCases).toBe(0);
    expect(summary.mainModelRequests).toBe(0);
    expect(summary.mainModelCallAvoidanceRate).toBeNull();
    expect(summary.totalInputTokens).toBeNull();
    expect(summary.totalOutputTokens).toBeNull();
    expect(summary.totalCostUsd).toBeNull();
    expect(summary.knownPartialCostUsd).toBe(0);
  });

  it('marks partial run with failure as PARTIAL and avoidance as null', () => {
    const mockResults: BaselineCaseResult[] = [
      {
        caseId: 'base-01',
        category: 'DETERMINISTIC_CANDIDATE',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        status: 'PASS',
        deltaCount: 3,
        characterCount: 15,
        ttftMs: 1200,
        totalDurationMs: 1500,
        inputTokens: 50,
        outputTokens: 10,
        estimatedCostUsd: calculateTurnCostUsd(50, 10),
        terminalEvent: 'completed',
      },
      {
        caseId: 'base-02',
        category: 'GENERATIVE_REQUIRED',
        expectedRoutingClass: 'GENERATIVE_REQUIRED',
        status: 'FAIL',
        deltaCount: 0,
        characterCount: 0,
        ttftMs: null,
        totalDurationMs: 500,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        terminalEvent: 'exception',
        providerFailureCategory: 'network_timeout',
      },
    ];

    const summary = computeBaselineSummary(mockResults, 12);
    expect(summary.benchmarkStatus).toBe('PARTIAL');
    expect(summary.executedCases).toBe(1);
    expect(summary.failedCases).toBe(1);
    expect(summary.mainModelRequests).toBe(2);
    expect(summary.mainModelCallAvoidanceRate).toBeNull();
    expect(summary.totalCostUsd).not.toBeNull();
  });

  it('preserves null tokens and null cost when provider usage is missing (never defaults to $0)', () => {
    const cost = calculateTurnCostUsd(null, null);
    expect(cost).toBeNull();

    const mockResults: BaselineCaseResult[] = [
      {
        caseId: 'base-01',
        category: 'DETERMINISTIC_CANDIDATE',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        status: 'PASS',
        deltaCount: 3,
        characterCount: 15,
        ttftMs: 1200,
        totalDurationMs: 1500,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        terminalEvent: 'completed',
      },
    ];

    const summary = computeBaselineSummary(mockResults, 1);
    expect(summary.benchmarkStatus).toBe('COMPLETE');
    expect(summary.totalInputTokens).toBeNull();
    expect(summary.totalOutputTokens).toBeNull();
    expect(summary.totalCostUsd).toBeNull();
    expect(summary.averageCostPerTurnUsd).toBeNull();
    expect(summary.knownPartialCostUsd).toBe(0);
  });
});
