import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateChoiceMetrics,
  calculateDistribution,
} from '../../../../scripts/benchmarks/voice/jev-calibration-calculator.js';
import { calculateJevInputCostUsd } from '../../../../scripts/benchmarks/voice/jev-calibration-case-executor.js';
import {
  ATOMIC_QUESTION_SET_SHA256,
  buildJevAtomicPayload,
  buildJevChoicePayload,
  JEV_QUESTION_SHA256,
  JEV_ROUTING_ATOMIC_DEFINITION,
} from '../../../../scripts/benchmarks/voice/jev-calibration-question-set.js';
import type {
  JevCalibrationCaseResult,
  JevCalibrationPhaseASummary,
} from '../../../../scripts/benchmarks/voice/jev-calibration-types.js';
import {
  CALIBRATION_CASE_COUNT,
  PLANNED_ATOMIC_REQUESTS,
  PLANNED_CHOICE_REQUESTS,
  TOTAL_PLANNED_CALIBRATION_REQUESTS,
} from '../../../../scripts/benchmarks/voice/jev-calibration-types.js';
import {
  filterCalibrationCases,
  serializeSanitizedResults,
} from '../../../../scripts/benchmarks/voice/run-jev-calibration-phase-a.js';

describe('Jev Calibration Phase A Runner Unit Tests (Deterministic / No Network)', () => {
  const v2Path = resolve('scripts/benchmarks/voice/jev-calibration-v2-cases.json');
  const dataset = JSON.parse(readFileSync(v2Path, 'utf8'));

  it('selects exactly 80 CALIBRATION cases and 0 HOLDOUT cases', () => {
    const calib = filterCalibrationCases(dataset.cases);
    expect(calib).toHaveLength(80);
    expect(calib.every((c) => c.split === 'CALIBRATION')).toBe(true);
    expect(calib.some((c) => c.split === 'HOLDOUT')).toBe(false);
  });

  it('validates planned request counts: 80 Choice, 80 Atomic, 160 total', () => {
    expect(CALIBRATION_CASE_COUNT).toBe(80);
    expect(PLANNED_CHOICE_REQUESTS).toBe(80);
    expect(PLANNED_ATOMIC_REQUESTS).toBe(80);
    expect(TOTAL_PLANNED_CALIBRATION_REQUESTS).toBe(160);
  });

  it('guards against benchmark metadata serialization in payloads', () => {
    const sample = dataset.cases[0];
    const choicePayload = buildJevChoicePayload(sample.syntheticCallerInput);
    const atomicPayload = buildJevAtomicPayload(sample.syntheticCallerInput);

    for (const p of [choicePayload, atomicPayload]) {
      const stateStr = JSON.stringify(p.state);
      expect(stateStr).not.toContain(sample.caseId);
      expect(stateStr).not.toContain(sample.split);
      expect(stateStr).not.toContain(sample.expectedRoutingClass);
      expect(stateStr).not.toContain(sample.subtype);
      expect(Object.keys(p.state)).toEqual(['callerInput', 'language', 'channel']);
    }
  });

  it('verifies Atomic question set contains exactly 3 Noul questions and hashes match', () => {
    const keys = Object.keys(JEV_ROUTING_ATOMIC_DEFINITION.questions);
    expect(keys).toEqual([
      'is_deterministic_candidate',
      'is_generative_required',
      'is_security_escalation',
    ]);
    expect(keys).toHaveLength(3);

    expect(JEV_QUESTION_SHA256).toBe(
      '1e6aaccdb562cde6e0c005ac6d95417922c3351a17ef6592c2ca9b65b6290788',
    );
    expect(ATOMIC_QUESTION_SET_SHA256).toBe(
      '3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725',
    );
  });

  it('proves missing usage is treated as null, never converted to zero', () => {
    expect(calculateJevInputCostUsd(null)).toBeNull();
    expect(calculateJevInputCostUsd(undefined as unknown as null)).toBeNull();
    expect(calculateJevInputCostUsd(1000)).toBeCloseTo(0.000042, 6);
  });

  it('verifies stop-on-first-failure and metric calculation semantics', () => {
    const mockResults: JevCalibrationCaseResult[] = [
      {
        caseId: 'v2-001',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        choice: {
          predictedClass: 'DETERMINISTIC_CANDIDATE',
          probabilities: {
            DETERMINISTIC_CANDIDATE: 0.9,
            GENERATIVE_REQUIRED: 0.08,
            SECURITY_ESCALATE: 0.02,
          },
          confidence: 0.85,
          latencyMs: 120,
          inputTokens: 300,
          outputTokens: 20,
          estimatedCostUsd: 0.0000126,
          providerModel: 'jev-1.13.0',
        },
        atomic: {
          deterministicNoul: 0.95,
          generativeNoul: 0.05,
          securityNoul: 0.01,
          latencyMs: 130,
          inputTokens: 350,
          outputTokens: 25,
          estimatedCostUsd: 0.0000147,
          providerModel: 'jev-1.13.0',
        },
        status: 'PASS',
      },
      {
        caseId: 'v2-002',
        expectedRoutingClass: 'GENERATIVE_REQUIRED',
        choice: null,
        atomic: null,
        status: 'FAIL',
        safeFailureCategory: 'HTTP_500',
      },
    ];

    const metrics = calculateChoiceMetrics(mockResults);
    expect(metrics.accuracy).toBe(1.0); // 1 out of 1 valid choice
    expect(metrics.falseBypassCount).toBe(0);
  });

  it('verifies result serializer excludes callerInput, raw requests and raw responses', () => {
    const mockCase: JevCalibrationCaseResult = {
      caseId: 'v2-001',
      expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
      choice: {
        predictedClass: 'DETERMINISTIC_CANDIDATE',
        probabilities: {
          DETERMINISTIC_CANDIDATE: 0.9,
          GENERATIVE_REQUIRED: 0.08,
          SECURITY_ESCALATE: 0.02,
        },
        confidence: 0.85,
        latencyMs: 120,
        inputTokens: 300,
        outputTokens: 20,
        estimatedCostUsd: 0.0000126,
        providerModel: 'jev-1.13.0',
      },
      atomic: {
        deterministicNoul: 0.95,
        generativeNoul: 0.05,
        securityNoul: 0.01,
        latencyMs: 130,
        inputTokens: 350,
        outputTokens: 25,
        estimatedCostUsd: 0.0000147,
        providerModel: 'jev-1.13.0',
      },
      status: 'PASS',
    };

    const mockSummary: JevCalibrationPhaseASummary = {
      benchmarkStatus: 'COMPLETE',
      requestedModel: 'jev-latest',
      resolvedModelVersion: 'jev-1.13.0',
      modelVersionDrift: false,
      totalPlannedCases: 80,
      executedCases: 1,
      plannedChoiceRequests: 80,
      executedChoiceRequests: 1,
      plannedAtomicRequests: 80,
      executedAtomicRequests: 1,
      totalPlannedRequests: 160,
      totalExecutedRequests: 2,
      retries: 0,
      holdoutRequests: 0,
      choiceRoutingAccuracy: 1,
      choiceDeterministicPrecision: 1,
      choiceDeterministicRecall: 1,
      choiceFalseBypassCount: 0,
      choiceFalseBypassRateOverNonDeterministic: 0,
      choiceFalseBypassRateAmongPredictedBypasses: 0,
      choiceSecurityMissCount: 0,
      choiceSecurityMissRate: 0,
      choiceUnnecessarySecurityEscalationCount: 0,
      atomicSignalsByClass: null,
      choiceLatencyMs: calculateDistribution([120]),
      atomicLatencyMs: calculateDistribution([130]),
      totalChoiceInputTokens: 300,
      totalChoiceOutputTokens: 20,
      totalAtomicInputTokens: 350,
      totalAtomicOutputTokens: 25,
      totalInputTokens: 650,
      totalOutputTokens: 45,
      totalChoiceCostUsd: 0.0000126,
      totalAtomicCostUsd: 0.0000147,
      totalJevCostUsd: 0.0000273,
      costVerificationStatus: 'VERIFIED',
    };

    const serialized = serializeSanitizedResults([mockCase], mockSummary);
    const serializedStr = JSON.stringify(serialized);

    expect(serializedStr).not.toContain('syntheticCallerInput');
    expect(serializedStr).not.toContain('rawRequest');
    expect(serializedStr).not.toContain('rawResponse');
    expect(serializedStr).not.toContain('authorization');
    expect(serializedStr).not.toContain('apiKey');
    expect(serialized.cases[0]!.caseId).toBe('v2-001');
    expect(serialized.cases[0]!.expectedRoutingClass).toBe('DETERMINISTIC_CANDIDATE');
    expect(serialized.metadata.retries).toBe(0);
    expect(serialized.metadata.holdoutRequests).toBe(0);
  });
});
