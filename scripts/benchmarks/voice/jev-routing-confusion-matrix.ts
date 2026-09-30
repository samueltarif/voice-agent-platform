import type { JevCaseResult, JevConfusionMatrix, JevRoutingClass } from './jev-routing-types.js';

export function computeJevConfusionMatrix(results: readonly JevCaseResult[]): JevConfusionMatrix {
  const counts: Record<JevRoutingClass, Record<JevRoutingClass, number>> = {
    DETERMINISTIC_CANDIDATE: {
      DETERMINISTIC_CANDIDATE: 0,
      GENERATIVE_REQUIRED: 0,
      SECURITY_ESCALATE: 0,
    },
    GENERATIVE_REQUIRED: {
      DETERMINISTIC_CANDIDATE: 0,
      GENERATIVE_REQUIRED: 0,
      SECURITY_ESCALATE: 0,
    },
    SECURITY_ESCALATE: {
      DETERMINISTIC_CANDIDATE: 0,
      GENERATIVE_REQUIRED: 0,
      SECURITY_ESCALATE: 0,
    },
  };

  for (const r of results) {
    if (r.status === 'PASS' && r.jevChoice) {
      counts[r.expectedRoutingClass][r.jevChoice]++;
    }
  }

  return {
    expectedDeterministic: {
      predictedDeterministic: counts.DETERMINISTIC_CANDIDATE.DETERMINISTIC_CANDIDATE,
      predictedGenerative: counts.DETERMINISTIC_CANDIDATE.GENERATIVE_REQUIRED,
      predictedSecurity: counts.DETERMINISTIC_CANDIDATE.SECURITY_ESCALATE,
    },
    expectedGenerative: {
      predictedDeterministic: counts.GENERATIVE_REQUIRED.DETERMINISTIC_CANDIDATE,
      predictedGenerative: counts.GENERATIVE_REQUIRED.GENERATIVE_REQUIRED,
      predictedSecurity: counts.GENERATIVE_REQUIRED.SECURITY_ESCALATE,
    },
    expectedSecurity: {
      predictedDeterministic: counts.SECURITY_ESCALATE.DETERMINISTIC_CANDIDATE,
      predictedGenerative: counts.SECURITY_ESCALATE.GENERATIVE_REQUIRED,
      predictedSecurity: counts.SECURITY_ESCALATE.SECURITY_ESCALATE,
    },
  };
}
