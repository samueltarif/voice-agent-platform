import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateJevCostUsd,
  computeJevRoutingSummary,
} from '../../../../scripts/benchmarks/voice/jev-routing-calculator.js';
import { computeJevConfusionMatrix } from '../../../../scripts/benchmarks/voice/jev-routing-confusion-matrix.js';
import { buildJevRoutingPayload } from '../../../../scripts/benchmarks/voice/jev-payload-builder.js';
import type {
  JevCaseResult,
  JevRoutingClass,
} from '../../../../scripts/benchmarks/voice/jev-routing-types.js';
import {
  JEV_QUESTION_SHA256,
  JEV_ROUTING_QUESTION_DEFINITION,
} from '../../../../scripts/benchmarks/voice/jev-routing-types.js';

interface RawCase {
  caseId: string;
  category: string;
  expectedRoutingClass: JevRoutingClass;
  description: string;
  syntheticCallerInput: string;
}

interface RawDataset {
  version: string;
  cases: RawCase[];
}

describe('Jev Routing Benchmark - Local Deterministic Tests', () => {
  const datasetPath = resolve('scripts/benchmarks/voice/openai-baseline-v1-cases.json');
  const FROZEN_DATASET_SHA256 = '9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50';

  it('validates dataset integrity and exactly 12 cases', () => {
    const rawContent = readFileSync(datasetPath, 'utf8');
    const hash = createHash('sha256').update(rawContent).digest('hex');
    expect(hash).toBe(FROZEN_DATASET_SHA256);

    const parsed = JSON.parse(rawContent) as RawDataset;
    expect(parsed.cases).toHaveLength(12);
  });

  it('verifies question hash stability, 1 Choice question and 3 fixed options', () => {
    const canonical = JSON.stringify(JEV_ROUTING_QUESTION_DEFINITION);
    const hash = createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
    expect(hash).toBe(JEV_QUESTION_SHA256);

    const criteriaKeys = Object.keys(JEV_ROUTING_QUESTION_DEFINITION.criteria);
    expect(criteriaKeys).toEqual([
      'DETERMINISTIC_CANDIDATE',
      'GENERATIVE_REQUIRED',
      'SECURITY_ESCALATE',
    ]);
  });

  it('proves anti-leakage: ground truth is never serialized in state payload', () => {
    const rawContent = readFileSync(datasetPath, 'utf8');
    const parsed = JSON.parse(rawContent) as RawDataset;

    for (const c of parsed.cases) {
      const payload = buildJevRoutingPayload(c.syntheticCallerInput);
      const stateJson = JSON.stringify(payload.state);

      expect(stateJson).not.toContain(c.expectedRoutingClass);
      expect(stateJson).not.toContain(c.category);
      expect(stateJson).not.toContain(c.description);
      expect(stateJson).not.toContain(c.caseId);
      expect(Object.keys(payload.state)).toEqual(['callerInput', 'language', 'channel']);
      expect(payload.state).toEqual({
        callerInput: c.syntheticCallerInput,
        language: 'pt-BR',
        channel: 'phone',
      });
      expect(Object.keys(payload.questions)).toHaveLength(1);
    }
  });

  it('computes confusion matrix, accuracy and avoidance metrics correctly', () => {
    const mockResults: JevCaseResult[] = [
      {
        caseId: 'base-01',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        jevChoice: 'DETERMINISTIC_CANDIDATE',
        probabilities: {
          DETERMINISTIC_CANDIDATE: 0.9,
          GENERATIVE_REQUIRED: 0.05,
          SECURITY_ESCALATE: 0.05,
        },
        confidence: 0.9,
        jevLatencyMs: 300,
        inputTokens: 100,
        outputTokens: 15,
        estimatedCostUsd: calculateJevCostUsd(100),
        status: 'PASS',
      },
      {
        caseId: 'base-05',
        expectedRoutingClass: 'GENERATIVE_REQUIRED',
        jevChoice: 'DETERMINISTIC_CANDIDATE', // false bypass
        probabilities: {
          DETERMINISTIC_CANDIDATE: 0.6,
          GENERATIVE_REQUIRED: 0.3,
          SECURITY_ESCALATE: 0.1,
        },
        confidence: 0.6,
        jevLatencyMs: 400,
        inputTokens: 120,
        outputTokens: 15,
        estimatedCostUsd: calculateJevCostUsd(120),
        status: 'PASS',
      },
      {
        caseId: 'base-11',
        expectedRoutingClass: 'SECURITY_ESCALATE',
        jevChoice: 'GENERATIVE_REQUIRED', // security miss
        probabilities: {
          DETERMINISTIC_CANDIDATE: 0.1,
          GENERATIVE_REQUIRED: 0.8,
          SECURITY_ESCALATE: 0.1,
        },
        confidence: 0.8,
        jevLatencyMs: 350,
        inputTokens: 110,
        outputTokens: 15,
        estimatedCostUsd: calculateJevCostUsd(110),
        status: 'PASS',
      },
    ];

    const matrix = computeJevConfusionMatrix(mockResults);
    expect(matrix.expectedDeterministic.predictedDeterministic).toBe(1);
    expect(matrix.expectedGenerative.predictedDeterministic).toBe(1);
    expect(matrix.expectedSecurity.predictedGenerative).toBe(1);

    const summary = computeJevRoutingSummary(mockResults, 3);
    expect(summary.benchmarkStatus).toBe('COMPLETE');
    expect(summary.falseBypassCount).toBe(1);
    expect(summary.securityMissCount).toBe(1);
    expect(summary.safePotentialAvoidedCalls).toBe(1);
    expect(summary.unsafeFalseBypasses).toBe(1);
    expect(summary.deterministicPrecision).toBe(0.5);
  });

  it('guarantees unknown usage does not default to zero cost, and handles partial runs', () => {
    expect(calculateJevCostUsd(null)).toBeNull();

    const partialResults: JevCaseResult[] = [
      {
        caseId: 'base-01',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        jevChoice: 'DETERMINISTIC_CANDIDATE',
        probabilities: null,
        confidence: null,
        jevLatencyMs: 250,
        inputTokens: null, // unknown usage
        outputTokens: null,
        estimatedCostUsd: null,
        status: 'PASS',
      },
    ];

    const summary = computeJevRoutingSummary(partialResults, 12);
    expect(summary.benchmarkStatus).toBe('PARTIAL');
    expect(summary.totalInputTokens).toBeNull();
    expect(summary.totalJevCostUsd).toBeNull();
    expect(summary.counterfactualCombinedCostUsd).toBeNull();
    expect(summary.routingAccuracy).toBeNull();
  });
});
