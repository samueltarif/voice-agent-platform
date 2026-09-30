import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifySignal,
  comparePolicyFeasibilityAndRank,
  evaluatePolicyTriple,
  generateCandidateThresholds,
} from '../../../../scripts/benchmarks/voice/jev-candidate-policy-calculator.js';
import {
  EXPECTED_PHASE_A_RESULT_SHA256,
  runCandidatePolicyFit,
} from '../../../../scripts/benchmarks/voice/fit-jev-candidate-policy.js';
import {
  FROZEN_CANDIDATE_POLICY_DEFINITION,
  FROZEN_POLICY_SHA256,
  type CandidateCaseInput,
  type PolicyEvaluationMetrics,
  type PolicyThresholdTriple,
} from '../../../../scripts/benchmarks/voice/jev-candidate-policy-types.js';

describe('Jev Candidate Policy Fitting Tests (Calibration-Only)', () => {
  const artifactPath = resolve(
    'docs/research/results/phase-6-jev-calibration-v2-phase-a-run1.json',
  );

  it('validates Phase A result artifact contains exactly 80 calibration results and expected hash', () => {
    const rawBytes = readFileSync(artifactPath);
    const hash = createHash('sha256').update(rawBytes).digest('hex');
    expect(hash).toBe(EXPECTED_PHASE_A_RESULT_SHA256);

    const data = JSON.parse(rawBytes.toString('utf8')) as { cases: unknown[] };
    expect(data.cases).toHaveLength(80);
  });

  it('enforces policy family rule ordering and exact comparison operators', () => {
    const thresholds: PolicyThresholdTriple = {
      tSecurity: 0.5,
      tDeterministic: 0.6,
      tGenerative: 0.4,
    };

    // Rule 1 priority: security overrides high deterministic signal
    expect(
      classifySignal(
        { securityNoul: 0.5, deterministicNoul: 0.99, generativeNoul: 0.01 },
        thresholds,
      ),
    ).toBe('SECURITY_ESCALATE');

    // Rule 2: deterministic candidate when security < tSecurity AND det >= tDet AND gen <= tGen
    expect(
      classifySignal(
        { securityNoul: 0.49, deterministicNoul: 0.6, generativeNoul: 0.4 },
        thresholds,
      ),
    ).toBe('DETERMINISTIC_CANDIDATE');

    // Rule 2 boundary failure: gen > tGen falls through to GENERATIVE_REQUIRED
    expect(
      classifySignal(
        { securityNoul: 0.49, deterministicNoul: 0.9, generativeNoul: 0.41 },
        thresholds,
      ),
    ).toBe('GENERATIVE_REQUIRED');

    // Rule 2 boundary failure: det < tDet falls through to GENERATIVE_REQUIRED
    expect(
      classifySignal(
        { securityNoul: 0.49, deterministicNoul: 0.59, generativeNoul: 0.1 },
        thresholds,
      ),
    ).toBe('GENERATIVE_REQUIRED');
  });

  it('generates threshold candidates from unique observed values without arbitrary grids', () => {
    const values = [0.1, 0.4, 0.4, 0.8];
    const candidates = generateCandidateThresholds(values);
    // Boundaries [0.0, 1.0] plus midpoints (0.1+0.4)/2 = 0.25, (0.4+0.8)/2 = 0.6
    expect(candidates).toEqual([0.0, 0.25, 0.6, 1.0]);
  });

  it('correctly calculates metrics and denominators', () => {
    const mockCases: readonly CandidateCaseInput[] = [
      {
        caseId: 'm-1',
        expectedRoutingClass: 'DETERMINISTIC_CANDIDATE',
        atomic: { securityNoul: 0.05, deterministicNoul: 0.8, generativeNoul: 0.2 },
      },
      {
        caseId: 'm-2',
        expectedRoutingClass: 'GENERATIVE_REQUIRED',
        atomic: { securityNoul: 0.05, deterministicNoul: 0.8, generativeNoul: 0.2 },
      },
      {
        caseId: 'm-3',
        expectedRoutingClass: 'SECURITY_ESCALATE',
        atomic: { securityNoul: 0.9, deterministicNoul: 0.1, generativeNoul: 0.9 },
      },
    ];

    const thresholds: PolicyThresholdTriple = {
      tSecurity: 0.5,
      tDeterministic: 0.7,
      tGenerative: 0.3,
    };

    const metrics = evaluatePolicyTriple(mockCases, thresholds);
    expect(metrics.safeBypassCount).toBe(1);
    expect(metrics.falseBypassCount).toBe(1); // m-2 was generative but predicted deterministic
    expect(metrics.securityTruePositiveCount).toBe(1);
    expect(metrics.securityMissCount).toBe(0);
    expect(metrics.deterministicPrecision).toBe(0.5); // 1 / (1 + 1)
  });

  it('enforces feasibility constraints and optimization order', () => {
    const base: PolicyEvaluationMetrics = {
      routingAccuracy: 0.8,
      deterministicTruePositiveCount: 10,
      deterministicFalsePositiveCount: 0,
      deterministicFalseNegativeCount: 2,
      deterministicPrecision: 1,
      deterministicRecall: 0.83,
      safeBypassCount: 10,
      falseBypassCount: 0,
      falseBypassRateOverNonDeterministic: 0,
      falseBypassRateAmongPredictedBypasses: 0,
      securityTruePositiveCount: 5,
      securityMissCount: 0,
      securityMissRate: 0,
      unnecessarySecurityEscalationCount: 2,
      unnecessarySecurityEscalationRate: 0.05,
    };

    const infeasibleWithFalseBypass = { ...base, falseBypassCount: 1 };
    const infeasibleWithSecMiss = { ...base, securityMissCount: 1 };

    // Feasible always beats infeasible
    expect(comparePolicyFeasibilityAndRank(base, infeasibleWithFalseBypass)).toBeLessThan(0);
    expect(comparePolicyFeasibilityAndRank(base, infeasibleWithSecMiss)).toBeLessThan(0);

    // Primary: safe bypass count
    const higherBypass = { ...base, safeBypassCount: 12 };
    expect(comparePolicyFeasibilityAndRank(higherBypass, base)).toBeLessThan(0);

    // Secondary: unnecessary security escalation count
    const lowerEscalation = { ...base, unnecessarySecurityEscalationCount: 0 };
    expect(comparePolicyFeasibilityAndRank(lowerEscalation, base)).toBeLessThan(0);

    // Tertiary: accuracy
    const higherAcc = { ...base, routingAccuracy: 0.9 };
    expect(comparePolicyFeasibilityAndRank(higherAcc, base)).toBeLessThan(0);
  });

  it('executes deterministically, identifies equivalent regions, and preserves anti-leakage invariants', () => {
    const run1 = runCandidatePolicyFit();
    const run2 = runCandidatePolicyFit();

    expect(run1).toEqual(run2);
    expect(run1.feasiblePolicyCount).toBeGreaterThan(0);
    expect(run1.bestRegion.metrics.falseBypassCount).toBe(0);
    expect(run1.bestRegion.metrics.securityMissCount).toBe(0);
    expect(run1.bestRegion.metrics.safeBypassCount).toBe(26);
    expect(run1.bestRegion.tripleCount).toBe(66);
    expect(run1.holdoutEvaluated).toBe('NO');
    expect(run1.candidatePolicySelected).toBe('NO');
    expect(run1.policyFrozen).toBe('NO');
  });

  it('validates exact frozen candidate policy artifact, hash, and conservative tie-break', () => {
    expect(FROZEN_POLICY_SHA256).toBe(
      '1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93',
    );
    expect(FROZEN_CANDIDATE_POLICY_DEFINITION.rules[0].condition.threshold).toBe(0.56);
    expect(FROZEN_CANDIDATE_POLICY_DEFINITION.rules[1].condition.all[0].threshold).toBe(0.35);
    expect(FROZEN_CANDIDATE_POLICY_DEFINITION.rules[1].condition.all[1].threshold).toBe(0.47);

    const frozenArtifactPath = resolve(
      'docs/research/results/phase-6-jev-candidate-policy-frozen-v1.json',
    );
    const frozenJson = JSON.parse(readFileSync(frozenArtifactPath, 'utf8')) as {
      frozenPolicySha256: string;
      governanceStatus: { policyFrozen: string; candidatePolicySelected: string };
      calibrationMetrics: {
        safeBypassCount: number;
        falseBypassCount: number;
        securityMissCount: number;
        unnecessarySecurityEscalationCount: number;
        routingAccuracy: number;
      };
    };
    expect(frozenJson.frozenPolicySha256).toBe(FROZEN_POLICY_SHA256);
    expect(frozenJson.governanceStatus.policyFrozen).toBe('YES');
    expect(frozenJson.governanceStatus.candidatePolicySelected).toBe('YES');
    expect(frozenJson.calibrationMetrics.safeBypassCount).toBe(26);
    expect(frozenJson.calibrationMetrics.falseBypassCount).toBe(0);
    expect(frozenJson.calibrationMetrics.securityMissCount).toBe(0);
    expect(frozenJson.calibrationMetrics.unnecessarySecurityEscalationCount).toBe(0);
    expect(frozenJson.calibrationMetrics.routingAccuracy).toBe(0.975);
  });
});
