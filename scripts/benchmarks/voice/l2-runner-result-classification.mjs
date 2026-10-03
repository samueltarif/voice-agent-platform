export function classifyTypeSafeError(err, isTimedOut) {
  if (isTimedOut) return { status: 'TIMEOUT', errorCategory: 'TIMEOUT' };
  const safeName = err instanceof Error ? err.name : 'UnknownError';
  if (safeName === 'OfflineNetworkDeniedError') {
    return { status: 'PROVIDER_ERROR', errorCategory: 'OFFLINE_NETWORK_DENIED' };
  }
  if (safeName === 'InputBudgetExceededError') {
    return { status: 'INPUT_BUDGET_EXCEEDED', errorCategory: 'INPUT_BUDGET_EXCEEDED' };
  }
  if (safeName === 'TypeSafeModelIdentityMismatchError') {
    return { status: 'MODEL_IDENTITY_MISMATCH', errorCategory: safeName };
  }
  if (safeName === 'AbortError' || safeName === 'TimeoutError') {
    return { status: 'TIMEOUT', errorCategory: safeName };
  }
  const msg = err instanceof Error ? err.message : '';
  const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0;
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('401') ||
    msg.includes('403') ||
    safeName === 'HttpAuthError'
  ) {
    return { status: 'HTTP_AUTH_ERROR', errorCategory: 'HTTP_AUTH_ERROR' };
  }
  return { status: 'PROVIDER_ERROR', errorCategory: safeName };
}

export function classifyOpenAiError(err, isTimedOut) {
  if (isTimedOut) return { status: 'TIMEOUT', errorCategory: 'TIMEOUT' };
  const safeName = err instanceof Error ? err.name : 'UnknownError';
  if (safeName === 'OfflineNetworkDeniedError') {
    return { status: 'PROVIDER_ERROR', errorCategory: 'OFFLINE_NETWORK_DENIED' };
  }
  if (safeName === 'InputBudgetExceededError') {
    return { status: 'INPUT_BUDGET_EXCEEDED', errorCategory: 'INPUT_BUDGET_EXCEEDED' };
  }
  if (safeName === 'AbortError' || safeName === 'TimeoutError') {
    return { status: 'TIMEOUT', errorCategory: safeName };
  }
  const msg = err instanceof Error ? err.message : '';
  const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0;
  if (status === 401 || status === 403 || msg.includes('401') || msg.includes('403')) {
    return { status: 'HTTP_AUTH_ERROR', errorCategory: 'HTTP_AUTH_ERROR' };
  }
  return { status: 'PROVIDER_ERROR', errorCategory: safeName };
}

export function classifyRunResult(params) {
  const {
    casesEvaluated,
    totalExpected,
    technicalFailures,
    timeouts,
    typeSafeMismatch,
    coreJointChainObserved,
    stoppedEarly,
  } = params;
  if (typeSafeMismatch) return 'MODEL_IDENTITY_MISMATCH';
  if (technicalFailures > 0 || timeouts > 0) return 'PROVIDER_FAILURE';
  if (stoppedEarly || casesEvaluated < totalExpected) return 'EXECUTION_STOPPED';
  if (coreJointChainObserved) return 'PASS_COMPLETE';
  return 'PARTIAL_CHAIN_OBSERVED';
}

export function buildCaseResult(caseData, details) {
  const {
    matcherMatched,
    jevCalled,
    jevProviderModel,
    jevLatencyMs,
    openAiCalled,
    openAiLatencyMs,
    observedRoute,
    technicalStatus,
    errorCategory,
    openAiModelId,
  } = details;

  return {
    result: {
      caseId: caseData.caseId,
      intendedStimulusClass: caseData.intendedStimulusClass,
      matcherMatched,
      jevCalled,
      jevProviderModel,
      observedRoute,
      openAiCalled,
      openAiRequestedModel: openAiCalled ? openAiModelId : null,
      openAiObservedModel: null,
      technicalStatus,
      jevLatencyMs,
      openAiLatencyMs,
      errorCategory,
    },
    shouldStop: details.shouldStop,
  };
}
