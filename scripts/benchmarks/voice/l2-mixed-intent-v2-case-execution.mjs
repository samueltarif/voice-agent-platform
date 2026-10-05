import {
  buildV2CaseEvidence,
  evaluateCriterionAV2,
} from './l2-mixed-intent-v2-result-classification.mjs';
import {
  attemptV2DeterministicDispatch,
  dispatchV2OpenAi,
  evaluateV2Jev,
} from './l2-mixed-intent-v2-provider-dispatch.mjs';

export function createV2InitialState() {
  return {
    typeSafeRequestsAttempted: 0,
    typeSafeRequestsSucceeded: 0,
    openAiRequestsAttempted: 0,
    openAiRequestsSucceeded: 0,
    totalProviderRequestsAttempted: 0,
    matcherTrueCount: 0,
    matcherFalseCount: 0,
    capabilityRelevantTrue: 0,
    capabilityRelevantFalse: 0,
    exactlyAnswerableTrue: 0,
    exactlyAnswerableFalse: 0,
    jevEvaluatedCount: 0,
    openAiInvokedCount: 0,
    jointChainObservedCount: 0,
    deterministicDeclineFallbackCount: 0,
    securityBlockedCount: 0,
    technicalFailures: 0,
    timeouts: 0,
    consecutiveFailures: 0,
    criterionAV2PassObserved: false,
    typeSafeMismatch: false,
  };
}

function contractMatches(caseData, matcherMatched, involvement) {
  return (
    matcherMatched === caseData.expectedMatcherMatched &&
    involvement.relevant === caseData.expectedCapabilityRelevant &&
    involvement.exactlyAnswerable === caseData.expectedExactlyAnswerable
  );
}

function recordMatcherCounters(state, matcherMatched, involvement) {
  if (matcherMatched) state.matcherTrueCount++;
  else state.matcherFalseCount++;
  if (involvement.relevant) state.capabilityRelevantTrue++;
  else state.capabilityRelevantFalse++;
  if (involvement.exactlyAnswerable) state.exactlyAnswerableTrue++;
  else state.exactlyAnswerableFalse++;
}

function finalizeEvidence(caseId, partial) {
  const evidence = buildV2CaseEvidence(caseId, partial);
  evidence.criterionAV2Pass = evaluateCriterionAV2(evidence);
  return evidence;
}

function contractMismatchOutcome(caseData, matcherMatched, involvement, state) {
  state.technicalFailures++;
  const evidence = finalizeEvidence(caseData.id, {
    matcherMatched,
    capabilityRelevant: involvement.relevant,
    exactlyAnswerable: involvement.exactlyAnswerable,
    jevEvaluated: false,
    jevProviderModel: null,
    policyOutcome: null,
    openAiInvoked: false,
    completionObserved: false,
    securityEscalated: false,
    deterministicDispatchAttempted: false,
    deterministicHandled: false,
    deterministicDeclineFallback: false,
    criterionAV2Pass: false,
    technicalStatus: 'CONTRACT_MISMATCH',
    errorCategory: 'DATASET_CONTRACT_MISMATCH',
  });
  return { evidence, shouldStop: false };
}

function securityOutcome(caseData, matcherMatched, involvement, state, jev, policy) {
  state.securityBlockedCount++;
  const evidence = finalizeEvidence(caseData.id, {
    matcherMatched,
    capabilityRelevant: involvement.relevant,
    exactlyAnswerable: involvement.exactlyAnswerable,
    jevEvaluated: true,
    jevProviderModel: jev.output.providerModel,
    policyOutcome: policy,
    openAiInvoked: false,
    completionObserved: false,
    securityEscalated: true,
    deterministicDispatchAttempted: false,
    deterministicHandled: false,
    deterministicDeclineFallback: false,
    criterionAV2Pass: false,
    technicalStatus: 'SUCCESS',
    errorCategory: null,
  });
  return { evidence, shouldStop: false };
}

export async function executeMixedIntentV2Case(params) {
  const { caseData, deps, typeSafeAdapter, openAiAdapter, state, timeoutMs } = params;
  const matcherMatched = deps.matchesOperatingHoursCapability(caseData.callerTranscript);
  const involvement = deps.resolveOperatingHoursInvolvement(caseData.callerTranscript);
  recordMatcherCounters(state, matcherMatched, involvement);
  if (!contractMatches(caseData, matcherMatched, involvement)) {
    return contractMismatchOutcome(caseData, matcherMatched, involvement, state);
  }
  const jev = await evaluateV2Jev({ typeSafeAdapter, caseData, state, deps, timeoutMs });
  if (jev.capError || jev.errorResult) {
    return jevFailureOutcome(caseData, matcherMatched, involvement, jev);
  }
  state.jevEvaluatedCount++;
  const policy = deps.interpretFrozenTurnPolicy({
    securityScore: jev.output.securityScore,
    deterministicScore: jev.output.deterministicScore,
    generativeScore: jev.output.generativeScore,
  });
  if (policy === 'SECURITY_ESCALATE') {
    return securityOutcome(caseData, matcherMatched, involvement, state, jev, policy);
  }
  return generativePathOutcome({
    caseData,
    deps,
    openAiAdapter,
    state,
    timeoutMs,
    matcherMatched,
    involvement,
    jev,
    policy,
  });
}

function jevFailureOutcome(caseData, matcherMatched, involvement, jev) {
  const blocked = Boolean(jev.capError);
  const evidence = finalizeEvidence(caseData.id, {
    matcherMatched,
    capabilityRelevant: involvement.relevant,
    exactlyAnswerable: involvement.exactlyAnswerable,
    jevEvaluated: false,
    jevProviderModel: jev.errorResult?.observedModel ?? null,
    policyOutcome: null,
    openAiInvoked: false,
    completionObserved: false,
    securityEscalated: false,
    deterministicDispatchAttempted: false,
    deterministicHandled: false,
    deterministicDeclineFallback: false,
    criterionAV2Pass: false,
    technicalStatus: blocked ? 'PROVIDER_ERROR' : jev.errorResult.technicalStatus,
    errorCategory: blocked ? jev.capError : jev.errorResult.errorCategory,
  });
  return { evidence, shouldStop: blocked || jev.errorResult.shouldStop };
}

async function generativePathOutcome(args) {
  const {
    caseData,
    deps,
    openAiAdapter,
    state,
    timeoutMs,
    matcherMatched,
    involvement,
    jev,
    policy,
  } = args;
  const needsDeterministicAttempt = policy === 'DETERMINISTIC_CANDIDATE';
  const handled = needsDeterministicAttempt
    ? attemptV2DeterministicDispatch(deps, caseData)
    : false;
  if (needsDeterministicAttempt && handled) {
    const evidence = finalizeEvidence(caseData.id, {
      matcherMatched,
      capabilityRelevant: involvement.relevant,
      exactlyAnswerable: involvement.exactlyAnswerable,
      jevEvaluated: true,
      jevProviderModel: jev.output.providerModel,
      policyOutcome: policy,
      openAiInvoked: false,
      completionObserved: false,
      securityEscalated: false,
      deterministicDispatchAttempted: true,
      deterministicHandled: true,
      deterministicDeclineFallback: false,
      criterionAV2Pass: false,
      technicalStatus: 'SUCCESS',
      errorCategory: null,
    });
    return { evidence, shouldStop: false };
  }
  const openAi = await dispatchV2OpenAi({ openAiAdapter, caseData, state, timeoutMs });
  if (openAi.invoked) state.openAiInvokedCount++;
  if (needsDeterministicAttempt) state.deterministicDeclineFallbackCount++;
  if (policy === 'GENERATIVE_REQUIRED' && openAi.completed) state.jointChainObservedCount++;
  const evidence = finalizeEvidence(caseData.id, {
    matcherMatched,
    capabilityRelevant: involvement.relevant,
    exactlyAnswerable: involvement.exactlyAnswerable,
    jevEvaluated: true,
    jevProviderModel: jev.output.providerModel,
    policyOutcome: policy,
    openAiInvoked: openAi.invoked,
    completionObserved: openAi.completed,
    securityEscalated: false,
    deterministicDispatchAttempted: needsDeterministicAttempt,
    deterministicHandled: false,
    deterministicDeclineFallback: needsDeterministicAttempt && openAi.invoked,
    criterionAV2Pass: false,
    technicalStatus: openAi.technicalStatus,
    errorCategory: openAi.errorCategory,
  });
  if (evidence.criterionAV2Pass) state.criterionAV2PassObserved = true;
  return { evidence, shouldStop: openAi.shouldStop };
}
