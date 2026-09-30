import type { JevRoutingClass } from './jev-routing-types.js';
import type {
  AtomicSignalsByClass,
  JevCalibrationCaseResult,
  NumericDistributionSummary,
} from './jev-calibration-types.js';

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
