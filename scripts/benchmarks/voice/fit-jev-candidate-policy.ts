import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifySignal,
  computeStabilityMargin,
  evaluatePolicyTriple,
  generateCandidateThresholds,
} from './jev-candidate-policy-calculator.js';
import type {
  CandidateCaseInput,
  CandidatePolicyFitResult,
  EquivalentPredictionRegion,
  PolicyEvaluationMetrics,
  PolicyThresholdTriple,
} from './jev-candidate-policy-types.js';

export const EXPECTED_PHASE_A_RESULT_SHA256 =
  '5355b3639f011c0812b5e370a3dc7675e89e8f077d82fb3595dafdef2f0a0565' as const;

export function runCandidatePolicyFit(customArtifactPath?: string): CandidatePolicyFitResult {
  const artifactPath =
    customArtifactPath ??
    resolve('docs/research/results/phase-6-jev-calibration-v2-phase-a-run1.json');
  const rawBytes = readFileSync(artifactPath);
  const actualHash = createHash('sha256').update(rawBytes).digest('hex');

  if (!customArtifactPath && actualHash !== EXPECTED_PHASE_A_RESULT_SHA256) {
    throw new Error(
      `Artifact integrity mismatch: expected ${EXPECTED_PHASE_A_RESULT_SHA256} but got ${actualHash}`,
    );
  }

  const rawJson = JSON.parse(rawBytes.toString('utf8')) as {
    cases: Array<{
      caseId: string;
      expectedRoutingClass: 'DETERMINISTIC_CANDIDATE' | 'GENERATIVE_REQUIRED' | 'SECURITY_ESCALATE';
      atomic: {
        deterministicNoul: number;
        generativeNoul: number;
        securityNoul: number;
      };
    }>;
  };

  const cases: readonly CandidateCaseInput[] = rawJson.cases.map((c) => ({
    caseId: c.caseId,
    expectedRoutingClass: c.expectedRoutingClass,
    atomic: {
      deterministicNoul: c.atomic.deterministicNoul,
      generativeNoul: c.atomic.generativeNoul,
      securityNoul: c.atomic.securityNoul,
    },
  }));

  if (cases.length !== 80) {
    throw new Error(`Expected exactly 80 calibration cases, received ${cases.length}`);
  }

  const tSecCandidates = generateCandidateThresholds(cases.map((c) => c.atomic.securityNoul));
  const tDetCandidates = generateCandidateThresholds(cases.map((c) => c.atomic.deterministicNoul));
  const tGenCandidates = generateCandidateThresholds(cases.map((c) => c.atomic.generativeNoul));

  let feasibleCount = 0;
  let bestSafeBypass = -1;
  let bestUnnecessarySec = 999;
  let bestAccuracy = -1;
  let bestTriples: PolicyThresholdTriple[] = [];
  let bestMetrics: PolicyEvaluationMetrics | null = null;

  for (const ts of tSecCandidates) {
    for (const td of tDetCandidates) {
      for (const tg of tGenCandidates) {
        const triple: PolicyThresholdTriple = {
          tSecurity: ts,
          tDeterministic: td,
          tGenerative: tg,
        };
        const m = evaluatePolicyTriple(cases, triple);

        if (m.falseBypassCount === 0 && m.securityMissCount === 0) {
          feasibleCount++;
          if (
            m.safeBypassCount > bestSafeBypass ||
            (m.safeBypassCount === bestSafeBypass &&
              m.unnecessarySecurityEscalationCount < bestUnnecessarySec) ||
            (m.safeBypassCount === bestSafeBypass &&
              m.unnecessarySecurityEscalationCount === bestUnnecessarySec &&
              m.routingAccuracy > bestAccuracy)
          ) {
            bestSafeBypass = m.safeBypassCount;
            bestUnnecessarySec = m.unnecessarySecurityEscalationCount;
            bestAccuracy = m.routingAccuracy;
            bestTriples = [triple];
            bestMetrics = m;
          } else if (
            m.safeBypassCount === bestSafeBypass &&
            m.unnecessarySecurityEscalationCount === bestUnnecessarySec &&
            m.routingAccuracy === bestAccuracy
          ) {
            bestTriples.push(triple);
          }
        }
      }
    }
  }

  if (bestTriples.length === 0 || !bestMetrics) {
    throw new Error('No feasible zero-false-bypass and zero-security-miss policy found');
  }

  const representative = bestTriples[Math.floor(bestTriples.length / 2)]!;
  const bestRegion: EquivalentPredictionRegion = {
    regionId: 'REGION-CALIB-FEASIBLE-01',
    tripleCount: bestTriples.length,
    tSecurityRange: {
      min: Math.min(...bestTriples.map((t) => t.tSecurity)),
      max: Math.max(...bestTriples.map((t) => t.tSecurity)),
    },
    tDeterministicRange: {
      min: Math.min(...bestTriples.map((t) => t.tDeterministic)),
      max: Math.max(...bestTriples.map((t) => t.tDeterministic)),
    },
    tGenerativeRange: {
      min: Math.min(...bestTriples.map((t) => t.tGenerative)),
      max: Math.max(...bestTriples.map((t) => t.tGenerative)),
    },
    metrics: bestMetrics,
    representativeTriple: representative,
  };

  const missedCaseIds = cases
    .filter((c) => classifySignal(c.atomic, representative) !== c.expectedRoutingClass)
    .map((c) => c.caseId);

  const result: CandidatePolicyFitResult = {
    benchmark: 'Phase 6 Jev Candidate Policy Fit on Calibration Only',
    fitTimestamp: '2026-09-30T17:00:00.000Z',
    phaseAArtifactSha256: actualHash,
    totalCalibrationCases: 80,
    thresholdCandidateCounts: {
      security: tSecCandidates.length,
      deterministic: tDetCandidates.length,
      generative: tGenCandidates.length,
      totalCombinations: tSecCandidates.length * tDetCandidates.length * tGenCandidates.length,
    },
    feasiblePolicyCount: feasibleCount,
    bestEquivalentRegionsCount: 1,
    bestRegion,
    missedCaseIds,
    stabilityMargin: computeStabilityMargin(cases),
    choiceBaselineComparison: {
      choiceAccuracy: 0.7625,
      choiceDeterministicPrecision: 0.6153846153846154,
      choiceDeterministicRecall: 0.8571428571428571,
      choiceFalseBypassRateAmongPredicted: 0.38461538461538464,
      candidateAccuracy: bestMetrics.routingAccuracy,
      candidateDeterministicPrecision: bestMetrics.deterministicPrecision,
      candidateDeterministicRecall: bestMetrics.deterministicRecall,
      candidateFalseBypassRateAmongPredicted: bestMetrics.falseBypassRateAmongPredictedBypasses,
    },
    calibrationSafeBypassRate: bestMetrics.safeBypassCount / 80,
    calibrationCounterfactualMainModelRequests: 80 - bestMetrics.safeBypassCount,
    status: 'CALIBRATION_CANDIDATE_REGION_FOUND',
    candidatePolicySelected: 'NO',
    policyFrozen: 'NO',
    holdoutEvaluated: 'NO',
  };

  return result;
}

if (!process.env.VITEST) {
  const result = runCandidatePolicyFit();
  const outputPath = resolve('docs/research/results/phase-6-jev-candidate-policy-fit-v1.json');
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`Saved candidate policy fit result to: ${outputPath}`);
  console.log(
    `Feasible: ${result.feasiblePolicyCount} / ${result.thresholdCandidateCounts.totalCombinations}`,
  );
  console.log(
    `Best Safe Bypass: ${result.bestRegion.metrics.safeBypassCount} / 28 (Rate: ${(result.calibrationSafeBypassRate * 100).toFixed(2)}%)`,
  );
  console.log(
    `Accuracy: ${(result.bestRegion.metrics.routingAccuracy * 100).toFixed(2)}% | False Bypass: ${result.bestRegion.metrics.falseBypassCount}`,
  );
}
