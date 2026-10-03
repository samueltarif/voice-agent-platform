import {
  REQUESTED_TYPESAFE_MODEL,
  EXPECTED_TYPESAFE_MODEL,
  MAX_TYPESAFE_INPUT_TOKENS_PER_REQ,
  TYPESAFE_PRICE_PER_BTOK,
  OPENAI_PRICE_STATUS,
} from './l2-runner-preconditions.mjs';
import {
  MAX_TYPESAFE_REQUESTS,
  MAX_OPENAI_REQUESTS,
  TOTAL_MAX_PROVIDER_REQUESTS,
  CONCURRENCY,
  RETRIES,
} from './l2-runner-request-caps.mjs';
import {
  RUNTIME_ENFORCED_INPUT_TOKEN_CAP,
  TOKEN_CAP_ENFORCEMENT,
  MAX_TYPESAFE_INPUT_CHARS_PER_REQ,
  MAX_OPENAI_INPUT_CHARS_PER_REQ,
} from './l2-runner-input-budget.mjs';

function buildResultMetadata({
  computedHash,
  cases,
  approvedCostCeilingUsd,
  classification,
  openAiModelId,
}) {
  return {
    suite: 'phase-6-l2-real-jev-openai-synthetic-integration',
    version: '1.2.0',
    classification,
    executedAt: new Date().toISOString(),
    datasetPath: 'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
    datasetSha256: computedHash,
    datasetCaseCount: cases.length,
    requestedTypeSafeModel: REQUESTED_TYPESAFE_MODEL,
    expectedTypeSafeModel: EXPECTED_TYPESAFE_MODEL,
    requestedOpenAiModel: openAiModelId,
    openAiModelIdentityStatus: 'NOT_OBSERVABLE_VIA_CURRENT_SURFACE',
    maxTypeSafeRequests: MAX_TYPESAFE_REQUESTS,
    maxOpenAiRequests: MAX_OPENAI_REQUESTS,
    totalMaxProviderRequests: TOTAL_MAX_PROVIDER_REQUESTS,
    concurrency: CONCURRENCY,
    retries: RETRIES,
    customerData: 0,
    twilioCalls: 0,
    projectedCostCeilingUsd: approvedCostCeilingUsd,
    pricePerBtokTypeSafe: TYPESAFE_PRICE_PER_BTOK,
    openAiPriceStatus: OPENAI_PRICE_STATUS,
    runtimeEnforcedInputTokenCap: RUNTIME_ENFORCED_INPUT_TOKEN_CAP,
    tokenCapEnforcement: TOKEN_CAP_ENFORCEMENT,
    maxTypeSafeInputChars: MAX_TYPESAFE_INPUT_CHARS_PER_REQ,
    maxOpenAiInputChars: MAX_OPENAI_INPUT_CHARS_PER_REQ,
  };
}

function buildResultAggregates(state, caseResults) {
  return {
    matcherEvaluations: caseResults.length,
    matcherMatchedCount: state.matcherMatchedCount,
    matcherUnmatchedCount: state.matcherUnmatchedCount,
    typeSafeRequestsAttempted: state.typeSafeRequestsAttempted,
    typeSafeRequestsSucceeded: state.typeSafeRequestsSucceeded,
    openAiRequestsAttempted: state.openAiRequestsAttempted,
    openAiRequestsSucceeded: state.openAiRequestsSucceeded,
    totalProviderRequestsAttempted: state.totalProviderRequestsAttempted,
    deterministicCount: state.deterministicCount,
    generativeCount: state.generativeCount,
    securityBlockedCount: state.securityBlockedCount,
    coreJointChainObserved: state.coreJointChainObserved,
    technicalFailures: state.technicalFailures,
    timeouts: state.timeouts,
    estimatedUpperBoundCostUsd: Number(
      (
        ((state.typeSafeRequestsAttempted * MAX_TYPESAFE_INPUT_TOKENS_PER_REQ) / 1_000_000_000) *
        TYPESAFE_PRICE_PER_BTOK
      ).toFixed(6),
    ),
  };
}

export function buildResultArtifact({
  computedHash,
  cases,
  caseResults,
  state,
  approvedCostCeilingUsd,
  classification,
  openAiModelId,
}) {
  return {
    metadata: buildResultMetadata({
      computedHash,
      cases,
      approvedCostCeilingUsd,
      classification,
      openAiModelId,
    }),
    aggregates: buildResultAggregates(state, caseResults),
    cases: caseResults,
  };
}
