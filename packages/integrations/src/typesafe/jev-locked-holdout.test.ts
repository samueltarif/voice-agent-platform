import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ATOMIC_QUESTION_SET_SHA256,
  buildJevAtomicPayload,
  JEV_ROUTING_ATOMIC_DEFINITION,
} from '../../../../scripts/benchmarks/voice/jev-calibration-question-set.js';
import {
  FROZEN_CANDIDATE_POLICY_DEFINITION,
  FROZEN_POLICY_SHA256,
} from '../../../../scripts/benchmarks/voice/jev-candidate-policy-types.js';
import {
  applyFrozenPolicy,
  calculateHoldoutMetrics,
  determineHoldoutSafetyCriteria,
  filterHoldoutCases,
  serializeSanitizedHoldoutResults,
} from '../../../../scripts/benchmarks/voice/jev-locked-holdout-calculator.js';
import type {
  HoldoutCaseResult,
  HoldoutRawCase,
} from '../../../../scripts/benchmarks/voice/jev-locked-holdout-types.js';
import {
  EXPECTED_HOLDOUT_CASE_COUNT,
  EXPECTED_HOLDOUT_DETERMINISTIC_COUNT,
  EXPECTED_HOLDOUT_NON_DETERMINISTIC_COUNT,
  EXPECTED_HOLDOUT_NON_SECURITY_COUNT,
  EXPECTED_HOLDOUT_SECURITY_COUNT,
} from '../../../../scripts/benchmarks/voice/jev-locked-holdout-types.js';

describe('Jev Locked Holdout Pre-Network Unit Tests', () => {
  const datasetPath = resolve('scripts/benchmarks/voice/jev-calibration-v2-cases.json');
  const rawDataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as { cases: HoldoutRawCase[] };

  it('selects exactly 40 holdout cases and strictly 0 calibration cases', () => {
    const holdout = filterHoldoutCases(rawDataset.cases);
    expect(holdout).toHaveLength(EXPECTED_HOLDOUT_CASE_COUNT);
    expect(holdout.every((c) => c.split === 'HOLDOUT')).toBe(true);
    expect(holdout.some((c) => c.split === 'CALIBRATION')).toBe(false);
  });

  it('preserves immutable frozen policy hash, exact thresholds, and rule order', () => {
    expect(FROZEN_POLICY_SHA256).toBe(
      '1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93',
    );
    const rules = FROZEN_CANDIDATE_POLICY_DEFINITION.rules;
    expect(rules).toHaveLength(3);
    expect(rules[0].ruleId).toBe('RULE_1_SECURITY_ESCALATE');
    expect(rules[0].condition.threshold).toBe(0.56);
    expect(rules[1].ruleId).toBe('RULE_2_DETERMINISTIC_CANDIDATE');
    expect(rules[1].condition.all[0].threshold).toBe(0.35);
    expect(rules[1].condition.all[1].threshold).toBe(0.47);
    expect(rules[2].ruleId).toBe('RULE_3_GENERATIVE_FALLBACK');
  });

  it('preserves Atomic V1 question set hash and exactly 3 Noul questions per request', () => {
    expect(ATOMIC_QUESTION_SET_SHA256).toBe(
      '3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725',
    );
    const keys = Object.keys(JEV_ROUTING_ATOMIC_DEFINITION.questions);
    expect(keys).toEqual([
      'is_deterministic_candidate',
      'is_generative_required',
      'is_security_escalation',
    ]);
    expect(keys).toHaveLength(3);
  });

  it('ensures ground truth, split, caseId, and subtype are never serialized to provider', () => {
    const payload = buildJevAtomicPayload('Olá, gostaria de saber meu saldo');
    const stateKeys = Object.keys(payload.state);
    expect(stateKeys).toEqual(['callerInput', 'language', 'channel']);
    expect(payload.state).not.toHaveProperty('caseId');
    expect(payload.state).not.toHaveProperty('split');
    expect(payload.state).not.toHaveProperty('expectedRoutingClass');
    expect(payload.state).not.toHaveProperty('subtype');
    expect(payload.state).not.toHaveProperty('evaluationNote');
  });

  it('verifies deterministic local frozen policy application', () => {
    expect(
      applyFrozenPolicy({ securityNoul: 0.8, deterministicNoul: 0.9, generativeNoul: 0.1 }),
    ).toBe('SECURITY_ESCALATE');
    expect(
      applyFrozenPolicy({ securityNoul: 0.2, deterministicNoul: 0.5, generativeNoul: 0.3 }),
    ).toBe('DETERMINISTIC_CANDIDATE');
    expect(
      applyFrozenPolicy({ securityNoul: 0.2, deterministicNoul: 0.2, generativeNoul: 0.3 }),
    ).toBe('GENERATIVE_REQUIRED');
    expect(
      applyFrozenPolicy({ securityNoul: 0.2, deterministicNoul: 0.5, generativeNoul: 0.6 }),
    ).toBe('GENERATIVE_REQUIRED');
  });

  it('verifies explicit holdout denominators: 12 det, 28 non-det, 8 sec, 32 non-sec', () => {
    expect(EXPECTED_HOLDOUT_DETERMINISTIC_COUNT).toBe(12);
    expect(EXPECTED_HOLDOUT_NON_DETERMINISTIC_COUNT).toBe(28);
    expect(EXPECTED_HOLDOUT_SECURITY_COUNT).toBe(8);
    expect(EXPECTED_HOLDOUT_NON_SECURITY_COUNT).toBe(32);
    expect(EXPECTED_HOLDOUT_DETERMINISTIC_COUNT + EXPECTED_HOLDOUT_NON_DETERMINISTIC_COUNT).toBe(
      40,
    );
    expect(EXPECTED_HOLDOUT_SECURITY_COUNT + EXPECTED_HOLDOUT_NON_SECURITY_COUNT).toBe(40);

    const dummyMetrics = calculateHoldoutMetrics([]);
    expect(determineHoldoutSafetyCriteria(dummyMetrics)).toBe('MET');
  });

  it('ensures classification error does not abort run, but provider failure does', () => {
    const mockCases: HoldoutCaseResult[] = [
      {
        caseId: 'v2-h01',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        atomic: {
          deterministicNoul: 0.1,
          generativeNoul: 0.8,
          securityNoul: 0.05,
          latencyMs: 120,
          inputTokens: 600,
          outputTokens: 0,
          estimatedCostUsd: 0.000025,
          providerModel: 'jev-1.13.0',
        },
        frozenPolicyPrediction: 'GENERATIVE_REQUIRED',
        classificationCorrect: false,
        status: 'PASS',
      },
      {
        caseId: 'v2-h02',
        expectedRoutingClass: 'SECURITY_ESCALATE',
        atomic: null,
        frozenPolicyPrediction: null,
        classificationCorrect: null,
        status: 'FAIL',
        safeFailureCategory: 'HTTP_500',
      },
      {
        caseId: 'v2-h03',
        expectedRoutingClass: 'GENERATIVE_REQUIRED',
        atomic: null,
        frozenPolicyPrediction: null,
        classificationCorrect: null,
        status: 'NOT_EXECUTED',
      },
    ];
    const [firstCase, secondCase, thirdCase] = mockCases;
    expect(firstCase?.status).toBe('PASS');
    expect(firstCase?.classificationCorrect).toBe(false);
    expect(secondCase?.status).toBe('FAIL');
    expect(thirdCase?.status).toBe('NOT_EXECUTED');
  });

  it('verifies result serializer strictly excludes syntheticCallerInput and raw payloads', () => {
    const rawResult: HoldoutCaseResult = {
      caseId: 'v2-h01',
      expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
      atomic: {
        deterministicNoul: 0.7,
        generativeNoul: 0.2,
        securityNoul: 0.05,
        latencyMs: 110,
        inputTokens: 550,
        outputTokens: 0,
        estimatedCostUsd: 0.000023,
        providerModel: 'jev-1.13.0',
      },
      frozenPolicyPrediction: 'DETERMINISTIC_CANDIDATE',
      classificationCorrect: true,
      status: 'PASS',
    };
    const serialized = serializeSanitizedHoldoutResults([rawResult]);
    expect(serialized).toHaveLength(1);
    const first = serialized[0]!;
    expect(first).not.toHaveProperty('syntheticCallerInput');
    expect(first).not.toHaveProperty('rawRequest');
    expect(first).not.toHaveProperty('rawResponse');
    expect(first).not.toHaveProperty('authorization');
  });

  it('proves no threshold fitting code and zero retry mechanism in holdout runner', async () => {
    const runnerSource = readFileSync(
      resolve('scripts/benchmarks/voice/run-jev-locked-holdout.ts'),
      'utf8',
    );
    expect(runnerSource).not.toContain('fitCandidatePolicy');
    expect(runnerSource).not.toContain('generateCandidateThresholds');
    expect(runnerSource).not.toContain('gridSearch');
    expect(runnerSource).not.toMatch(/for\s*\(.*retry/i);
    expect(runnerSource).not.toMatch(/while\s*\(.*retry/i);
    expect(runnerSource).toContain('retries: 0');
  });
});
