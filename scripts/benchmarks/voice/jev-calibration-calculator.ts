import type { JevRoutingClass } from './jev-routing-types.js';
import type {
  AtomicSignalsByClass,
  JevCalibrationCaseResult,
  JevCalibrationPhaseASummary,
  NumericDistributionSummary,
} from './jev-calibration-types.js';
import { CALIBRATION_CASE_COUNT } from './jev-calibration-types.js';

export interface RawV2Case {
  readonly caseId: string;
  readonly split: 'CALIBRATION' | 'HOLDOUT';
  readonly expectedRoutingClass: JevRoutingClass;
  readonly subtype: string;
  readonly syntheticCallerInput: string;
}

export interface RawV2Dataset {
  readonly version: string;
  readonly cases: readonly RawV2Case[];
}

export function filterCalibrationCases(allCases: readonly RawV2Case[]): readonly RawV2Case[] {
  const calib = allCases.filter((c) => c.split === 'CALIBRATION');

  if (calib.some((c) => c.split !== 'CALIBRATION')) {
    throw new Error('GUARD_VIOLATION: Non-calibration case included in calibration list');
  }
  if (calib.length !== CALIBRATION_CASE_COUNT) {
    throw new Error(
      `CALIBRATION_COUNT_MISMATCH: Expected ${CALIBRATION_CASE_COUNT} cases, got ${calib.length}`,
    );
  }
  return calib;
}

export function serializeSanitizedResults(
  cases: readonly JevCalibrationCaseResult[],
  summary: JevCalibrationPhaseASummary,
) {
  return {
    metadata: {
      benchmark: 'Phase 6 Jev Calibration v2 Phase A',
      datasetVersion: '2.0.0',
      executionTimestamp: new Date().toISOString(),
      requestedModel: summary.requestedModel,
      resolvedModelVersion: summary.resolvedModelVersion,
      modelVersionDrift: summary.modelVersionDrift,
      holdoutRequests: 0,
      retries: 0,
      thresholdSelected: 'NO',
      candidatePolicySelected: 'NO',
    },
    summary,
    cases: cases.map((c) => ({
      caseId: c.caseId,
      expectedRoutingClass: c.expectedRoutingClass,
      choice: c.choice,
      atomic: c.atomic,
      status: c.status,
      ...(c.safeFailureCategory ? { safeFailureCategory: c.safeFailureCategory } : {}),
    })),
  };
}

export function calculateDistribution(values: readonly number[]): NumericDistributionSummary {
  if (values.length === 0) {
    return { count: 0, min: 0, median: 0, max: 0, p25: 0, p75: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;

  const getPercentile = (p: number): number => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    if (lower === upper) return sorted[lower]!;
    return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
  };

  return {
    count: sorted.length,
    min,
    median: getPercentile(0.5),
    max,
    p25: getPercentile(0.25),
    p75: getPercentile(0.75),
  };
}

export function calculateChoiceMetrics(results: readonly JevCalibrationCaseResult[]) {
  const valid = results.filter((r) => r.choice !== null);
  const total = valid.length;
  if (total === 0) {
    return {
      accuracy: null,
      precision: null,
      recall: null,
      falseBypassCount: 0,
      falseBypassRateOverNonDet: null,
      falseBypassRateAmongPredicted: null,
      securityMissCount: 0,
      securityMissRate: null,
      unnecessarySecurityEscalationCount: 0,
    };
  }

  let correct = 0;
  let trueDet = 0;
  let falseDet = 0;
  let falseGen = 0;
  let expectedDet = 0;
  let expectedNonDet = 0;
  let expectedSec = 0;
  let secMiss = 0;
  let unnecessarySec = 0;

  for (const r of valid) {
    const exp = r.expectedRoutingClass;
    const pred = r.choice!.predictedClass;

    if (exp === pred) correct++;
    if (exp === 'DETERMINISTIC_CANDIDATE') expectedDet++;
    else expectedNonDet++;

    if (exp === 'SECURITY_ESCALATE') expectedSec++;
    if (exp === 'SECURITY_ESCALATE' && pred !== 'SECURITY_ESCALATE') secMiss++;
    if (exp !== 'SECURITY_ESCALATE' && pred === 'SECURITY_ESCALATE') unnecessarySec++;

    if (pred === 'DETERMINISTIC_CANDIDATE') {
      if (exp === 'DETERMINISTIC_CANDIDATE') trueDet++;
      else falseDet++;
    } else if (exp === 'DETERMINISTIC_CANDIDATE') {
      falseGen++;
    }
  }

  const candidateBypasses = trueDet + falseDet;
  const precision = candidateBypasses > 0 ? trueDet / candidateBypasses : null;
  const recall = expectedDet > 0 ? trueDet / (trueDet + falseGen) : null;
  const rateOverNonDet = expectedNonDet > 0 ? falseDet / expectedNonDet : null;
  const rateAmongPred = candidateBypasses > 0 ? falseDet / candidateBypasses : null;
  const secRate = expectedSec > 0 ? secMiss / expectedSec : null;

  return {
    accuracy: correct / total,
    precision,
    recall,
    falseBypassCount: falseDet,
    falseBypassRateOverNonDet: rateOverNonDet,
    falseBypassRateAmongPredicted: rateAmongPred,
    securityMissCount: secMiss,
    securityMissRate: secRate,
    unnecessarySecurityEscalationCount: unnecessarySec,
  };
}

export function calculateAtomicSignalsByClass(
  results: readonly JevCalibrationCaseResult[],
  targetClass: JevRoutingClass,
): AtomicSignalsByClass {
  const filtered = results.filter(
    (r) => r.expectedRoutingClass === targetClass && r.atomic !== null,
  );
  const detNoul = filtered.map((r) => r.atomic!.deterministicNoul);
  const genNoul = filtered.map((r) => r.atomic!.generativeNoul);
  const secNoul = filtered.map((r) => r.atomic!.securityNoul);

  return {
    deterministicNoul: calculateDistribution(detNoul),
    generativeNoul: calculateDistribution(genNoul),
    securityNoul: calculateDistribution(secNoul),
  };
}
