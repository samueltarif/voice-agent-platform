import { buildCaseResult } from './l2-runner-result-classification.mjs';
import { executeOpenAiTurn, evaluateTypeSafeJev } from './l2-runner-provider-dispatch.mjs';

export function resolveDeterministicRoute(deps, caseData, state) {
  const detResult = deps.handleOperatingHoursTurn({
    sessionOrganizationId: '00000000-0000-0000-0000-000000000000',
    configurationOrganizationId: '00000000-0000-0000-0000-000000000000',
    callerTranscript: caseData.syntheticCallerUtterance,
    operatingHours: 'Segunda a Sexta, das 08h \u00e0s 18h',
  });
  if (detResult.handled) {
    state.deterministicCount++;
    return 'DETERMINISTIC_RESPONSE';
  }
  return 'GENERATIVE';
}

function handleJevPolicyRoute(deps, caseData, state, jevOutput) {
  const policy = deps.interpretFrozenTurnPolicy({
    securityScore: jevOutput.securityScore,
    deterministicScore: jevOutput.deterministicScore,
    generativeScore: jevOutput.generativeScore,
  });
  if (policy === 'SECURITY_ESCALATE') {
    state.securityBlockedCount++;
    return { observedRoute: 'SECURITY_BLOCKED', policy };
  }
  if (policy === 'DETERMINISTIC_CANDIDATE') {
    return { observedRoute: resolveDeterministicRoute(deps, caseData, state), policy };
  }
  return { observedRoute: 'GENERATIVE', policy };
}

async function executeUnmatchedCase({
  caseData,
  openAiAdapter,
  state,
  logger,
  timeoutMs,
  openAiModelId,
}) {
  const res = await executeOpenAiTurn({ openAiAdapter, caseData, state, logger, timeoutMs });
  return buildCaseResult(caseData, {
    matcherMatched: false,
    jevCalled: false,
    jevProviderModel: null,
    jevLatencyMs: null,
    openAiCalled: true,
    openAiLatencyMs: res.latencyMs,
    observedRoute: 'GENERATIVE',
    technicalStatus: res.technicalStatus,
    errorCategory: res.errorCategory,
    shouldStop: res.shouldStop,
    openAiModelId,
  });
}

async function executeGenerativeTurnIfRequired({
  observedRoute,
  policy,
  openAiAdapter,
  caseData,
  state,
  logger,
  timeoutMs,
}) {
  if (observedRoute !== 'GENERATIVE') {
    return {
      openAiCalled: false,
      openAiLatencyMs: null,
      technicalStatus: 'SUCCESS',
      errorCategory: null,
      shouldStop: false,
    };
  }
  const openAiRes = await executeOpenAiTurn({ openAiAdapter, caseData, state, logger, timeoutMs });
  if (policy === 'GENERATIVE_REQUIRED' && openAiRes.technicalStatus === 'SUCCESS') {
    state.coreJointChainObserved = true;
  }
  return {
    openAiCalled: true,
    openAiLatencyMs: openAiRes.latencyMs,
    technicalStatus: openAiRes.technicalStatus,
    errorCategory: openAiRes.errorCategory,
    shouldStop: openAiRes.shouldStop,
  };
}

async function executeMatchedCase(params, jevRes) {
  const { caseData, deps, openAiAdapter, state, logger, timeoutMs, openAiModelId } = params;
  if (jevRes.errorResult) {
    return buildCaseResult(caseData, {
      matcherMatched: true,
      jevCalled: true,
      jevProviderModel: jevRes.observedModel,
      jevLatencyMs: jevRes.latencyMs,
      openAiCalled: false,
      openAiLatencyMs: null,
      observedRoute: 'GENERATIVE',
      technicalStatus: jevRes.errorResult.technicalStatus,
      errorCategory: jevRes.errorResult.errorCategory,
      shouldStop: jevRes.errorResult.shouldStop,
      openAiModelId,
    });
  }
  const { observedRoute, policy } = handleJevPolicyRoute(deps, caseData, state, jevRes.output);
  const openAi = await executeGenerativeTurnIfRequired({
    observedRoute,
    policy,
    openAiAdapter,
    caseData,
    state,
    logger,
    timeoutMs,
  });
  return buildCaseResult(caseData, {
    matcherMatched: true,
    jevCalled: true,
    jevProviderModel: jevRes.observedModel,
    jevLatencyMs: jevRes.latencyMs,
    openAiCalled: openAi.openAiCalled,
    openAiLatencyMs: openAi.openAiLatencyMs,
    observedRoute,
    technicalStatus: openAi.technicalStatus,
    errorCategory: openAi.errorCategory,
    shouldStop: openAi.shouldStop,
    openAiModelId,
  });
}

export async function executeCase(params) {
  const { caseData, deps, typeSafeAdapter, state, logger, timeoutMs } = params;
  const isMatched = deps.matchesOperatingHoursCapability(caseData.syntheticCallerUtterance);
  if (isMatched) state.matcherMatchedCount++;
  else state.matcherUnmatchedCount++;
  if (!isMatched) {
    return executeUnmatchedCase(params);
  }
  const jevRes = await evaluateTypeSafeJev({
    typeSafeAdapter,
    caseData,
    state,
    deps,
    logger,
    timeoutMs,
  });
  return executeMatchedCase(params, jevRes);
}
