import { classifyOpenAiError, classifyTypeSafeError } from './l2-runner-result-classification.mjs';

export { classifyOpenAiError, classifyTypeSafeError };

export function evaluateCriterionAV2(evidence) {
  if (!evidence || typeof evidence !== 'object') return false;
  return (
    evidence.capabilityRelevant === true &&
    evidence.exactlyAnswerable === false &&
    evidence.jevEvaluated === true &&
    evidence.policyOutcome === 'GENERATIVE_REQUIRED' &&
    evidence.openAiInvoked === true &&
    evidence.completionObserved === true &&
    evidence.securityEscalated === false &&
    evidence.deterministicDeclineFallback === false &&
    (evidence.technicalStatus === 'SUCCESS' || evidence.technicalStatus == null) &&
    evidence.errorCategory == null
  );
}

export function classifyV2RunResult(params) {
  const {
    casesEvaluated,
    totalExpected,
    technicalFailures,
    timeouts,
    typeSafeMismatch,
    stoppedEarly,
    criterionPassObserved,
  } = params;
  if (typeSafeMismatch) return 'MODEL_IDENTITY_MISMATCH';
  if (technicalFailures > 0 || timeouts > 0) return 'FAILED_TECHNICAL';
  if (stoppedEarly || casesEvaluated < totalExpected) return 'EXECUTION_STOPPED';
  if (criterionPassObserved) return 'PASS_COMPLETE';
  return 'NO_V2_GENERATIVE_REQUIRED_CASE_OBSERVED';
}

export function buildV2CaseEvidence(caseId, fields) {
  return {
    schemaVersion: '2.0.0',
    caseId,
    matcherMatched: fields.matcherMatched,
    capabilityRelevant: fields.capabilityRelevant,
    exactlyAnswerable: fields.exactlyAnswerable,
    jevEvaluated: fields.jevEvaluated,
    jevProviderModel: fields.jevProviderModel,
    policyOutcome: fields.policyOutcome,
    openAiInvoked: fields.openAiInvoked,
    completionObserved: fields.completionObserved,
    securityEscalated: fields.securityEscalated,
    deterministicDispatchAttempted: fields.deterministicDispatchAttempted,
    deterministicHandled: fields.deterministicHandled,
    deterministicDeclineFallback: fields.deterministicDeclineFallback,
    criterionAV2Pass: fields.criterionAV2Pass,
    technicalStatus: fields.technicalStatus,
    errorCategory: fields.errorCategory,
  };
}
