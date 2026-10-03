#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const EXPECTED_DATASET_SHA256 =
  'bd812341a922ded1c7159191849dae284a88f24afd9c7e8d3c64f9b081602f3f';
export const EXPECTED_CASE_COUNT = 12;
export const REQUESTED_TYPESAFE_MODEL = 'jev-1.13.0';
export const EXPECTED_TYPESAFE_MODEL = 'jev-1.13.0';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export const MAX_TYPESAFE_REQUESTS = 7;
export const MAX_OPENAI_REQUESTS = 12;
export const TOTAL_MAX_PROVIDER_REQUESTS = 19;
export const CONCURRENCY = 1;
export const RETRIES = 0;

export const RESEARCH_HARNESS_TIMEOUT_MS = 5000;
export const TYPESAFE_PRICE_PER_BTOK = 42;
export const MAX_TYPESAFE_INPUT_TOKENS_PER_REQ = 1000;
export const TYPESAFE_HISTORICAL_PROJECTED_COST_USD = Number(
  (
    ((MAX_TYPESAFE_REQUESTS * MAX_TYPESAFE_INPUT_TOKENS_PER_REQ) / 1_000_000_000) *
    TYPESAFE_PRICE_PER_BTOK
  ).toFixed(6),
);
export const MAX_PROJECTED_TYPESAFE_COST_USD = TYPESAFE_HISTORICAL_PROJECTED_COST_USD;
export const OPENAI_PRICE_STATUS = 'NOT_VERIFIED';
export const PROPOSED_COST_CEILING_USD = 0.25;

export class OfflineNetworkDeniedError extends Error {
  constructor() {
    super('OFFLINE_NETWORK_DENIED: Attempted network request in offline mode');
    this.name = 'OfflineNetworkDeniedError';
  }
}

export function computeSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function createDenyNetworkFetch() {
  return async () => {
    throw new OfflineNetworkDeniedError();
  };
}

export function parseCostCeiling(customArgs, customEnv) {
  const envVal = (customEnv ?? process.env).L2_COST_CEILING_USD;
  const args = customArgs ?? process.argv.slice(2);
  let rawVal = envVal;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cost-ceiling' && args[i + 1]) {
      rawVal = args[i + 1];
      break;
    }
  }
  if (!rawVal) {
    throw new Error(
      'FATAL: Cost ceiling not provided. Set L2_COST_CEILING_USD or pass --cost-ceiling <number>.',
    );
  }
  const num = Number(rawVal);
  if (Number.isNaN(num) || num <= 0) {
    throw new Error('FATAL: Approved cost ceiling must be a positive number.');
  }
  return num;
}

export function classifyTypeSafeError(err, isTimedOut) {
  if (isTimedOut) return { status: 'TIMEOUT', errorCategory: 'TIMEOUT' };
  const safeName = err instanceof Error ? err.name : 'UnknownError';
  if (safeName === 'OfflineNetworkDeniedError') {
    return { status: 'PROVIDER_ERROR', errorCategory: 'OFFLINE_NETWORK_DENIED' };
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

async function loadDependencies() {
  const [typeSafeMod, openAiMod, matcherMod, policyMod, turnHandlerMod] = await Promise.all([
    import(
      new URL(
        '../../../packages/integrations/dist/packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../packages/integrations/dist/packages/integrations/src/openai/openai-conversation-model-adapter.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../apps/voice/dist/apps/voice/src/operating-hours-capability-matcher.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../apps/voice/dist/apps/voice/src/frozen-policy-interpreter.js',
        import.meta.url,
      ).href
    ),
    import(
      new URL(
        '../../../apps/voice/dist/apps/voice/src/operating-hours-turn-handler.js',
        import.meta.url,
      ).href
    ),
  ]);
  return {
    TypeSafeJevTurnDecisionAdapter: typeSafeMod.TypeSafeJevTurnDecisionAdapter,
    TypeSafeModelIdentityMismatchError: typeSafeMod.TypeSafeModelIdentityMismatchError,
    OpenAiConversationModelAdapter: openAiMod.OpenAiConversationModelAdapter,
    matchesOperatingHoursCapability: matcherMod.matchesOperatingHoursCapability,
    interpretFrozenTurnPolicy: policyMod.interpretFrozenTurnPolicy,
    handleOperatingHoursTurn: turnHandlerMod.handleOperatingHoursTurn,
  };
}

export function validatePreconditions(options, isOffline) {
  if (!isOffline && (!options.allowLiveExecution || OPENAI_PRICE_STATUS === 'NOT_VERIFIED')) {
    throw new Error(
      'FATAL_LIVE_PREAUTH_BLOCKED: OpenAI price status is NOT_VERIFIED. Live execution is blocked until operator preauthorization.',
    );
  }
  const approvedCostCeilingUsd = isOffline
    ? 0
    : (options.costCeilingUsd ?? parseCostCeiling(options.customArgs, options.customEnv));
  const datasetPath =
    options.datasetPath ??
    resolve(
      process.cwd(),
      'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
    );
  const rawDataset = readFileSync(datasetPath, 'utf8');
  const computedHash = computeSha256(rawDataset);
  if (computedHash !== EXPECTED_DATASET_SHA256) {
    throw new Error(
      `FATAL: Dataset SHA-256 mismatch. Expected ${EXPECTED_DATASET_SHA256}, got ${computedHash}`,
    );
  }
  const parsedDataset = JSON.parse(rawDataset);
  const cases = parsedDataset.cases ?? [];
  if (cases.length !== EXPECTED_CASE_COUNT) {
    throw new Error(`FATAL: Expected exactly ${EXPECTED_CASE_COUNT} cases, found ${cases.length}`);
  }
  return { datasetPath, computedHash, cases, approvedCostCeilingUsd };
}

function checkCaps(state, targetProvider) {
  if (state.totalProviderRequestsAttempted >= TOTAL_MAX_PROVIDER_REQUESTS)
    return 'MAX_TOTAL_REQUESTS_EXCEEDED';
  if (targetProvider === 'TYPESAFE' && state.typeSafeRequestsAttempted >= MAX_TYPESAFE_REQUESTS)
    return 'MAX_TYPESAFE_REQUESTS_EXCEEDED';
  if (targetProvider === 'OPENAI' && state.openAiRequestsAttempted >= MAX_OPENAI_REQUESTS)
    return 'MAX_OPENAI_REQUESTS_EXCEEDED';
  return null;
}

async function invokeOpenAi(openAiAdapter, caseData, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  const stream = await openAiAdapter.streamTurn({
    turnId: caseData.caseId,
    generationId: `gen-${caseData.caseId}`,
    messages: [
      { role: 'system', content: 'Você é um assistente virtual profissional.' },
      { role: 'user', content: caseData.syntheticCallerUtterance },
    ],
    signal,
  });
  for await (const chunk of stream) {
    if (chunk.type === 'failure') throw new Error(chunk.error || 'OpenAI stream failure');
  }
}

async function executeOpenAiTurn({ openAiAdapter, caseData, state, logger, timeoutMs }) {
  const capError = checkCaps(state, 'OPENAI');
  if (capError) {
    state.technicalFailures++;
    return {
      technicalStatus: 'PROVIDER_ERROR',
      errorCategory: capError,
      shouldStop: true,
      latencyMs: null,
    };
  }
  state.openAiRequestsAttempted++;
  state.totalProviderRequestsAttempted++;
  const start = Date.now();
  try {
    await invokeOpenAi(openAiAdapter, caseData, timeoutMs);
    state.openAiRequestsSucceeded++;
    state.generativeCount++;
    state.consecutiveFailures = 0;
    return {
      technicalStatus: 'SUCCESS',
      errorCategory: null,
      shouldStop: false,
      latencyMs: Math.max(0, Date.now() - start),
    };
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const classification = classifyOpenAiError(err, isTimeout);
    state.technicalFailures++;
    state.consecutiveFailures++;
    if (classification.status === 'TIMEOUT') state.timeouts++;
    if (classification.status === 'HTTP_AUTH_ERROR')
      logger.error(`[L2 Runner] STOP: OpenAI Auth error on ${caseData.caseId}`);
    return {
      technicalStatus: classification.status,
      errorCategory: classification.errorCategory,
      shouldStop: classification.status === 'HTTP_AUTH_ERROR',
      latencyMs: Math.max(0, Date.now() - start),
    };
  }
}

async function evaluateTypeSafeJev({ typeSafeAdapter, caseData, state, deps, logger, timeoutMs }) {
  const capError = checkCaps(state, 'TYPESAFE');
  if (capError) {
    state.technicalFailures++;
    return {
      output: null,
      errorResult: {
        technicalStatus: 'PROVIDER_ERROR',
        errorCategory: capError,
        shouldStop: true,
        latencyMs: null,
        observedModel: null,
      },
    };
  }
  state.typeSafeRequestsAttempted++;
  state.totalProviderRequestsAttempted++;
  const start = Date.now();
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const output = await typeSafeAdapter.evaluateTurn({
      organizationId: '00000000-0000-0000-0000-000000000000',
      callId: `l2-call-${caseData.caseId}`,
      turnId: caseData.caseId,
      callerTranscript: caseData.syntheticCallerUtterance,
      language: 'pt-BR',
      channel: 'phone',
      signal,
    });
    state.typeSafeRequestsSucceeded++;
    state.consecutiveFailures = 0;
    return {
      output,
      errorResult: null,
      latencyMs: output.latencyMs ?? Math.max(0, Date.now() - start),
      observedModel: output.providerModel,
    };
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const classification = classifyTypeSafeError(err, isTimeout);
    state.technicalFailures++;
    state.consecutiveFailures++;
    if (classification.status === 'TIMEOUT') state.timeouts++;
    const isMismatch = err instanceof deps.TypeSafeModelIdentityMismatchError;
    const isAuth = classification.status === 'HTTP_AUTH_ERROR';
    if (isMismatch) state.typeSafeMismatch = true;
    if (isAuth) logger.error(`[L2 Runner] STOP: TypeSafe Auth error on ${caseData.caseId}`);
    return {
      output: null,
      latencyMs: Math.max(0, Date.now() - start),
      observedModel: isMismatch ? err.observedModel : null,
      errorResult: {
        technicalStatus: classification.status,
        errorCategory: classification.errorCategory,
        shouldStop: isMismatch || isAuth,
        latencyMs: Math.max(0, Date.now() - start),
        observedModel: isMismatch ? err.observedModel : null,
      },
    };
  }
}

function resolveDeterministicRoute(deps, caseData, state) {
  const detResult = deps.handleOperatingHoursTurn({
    sessionOrganizationId: '00000000-0000-0000-0000-000000000000',
    configurationOrganizationId: '00000000-0000-0000-0000-000000000000',
    callerTranscript: caseData.syntheticCallerUtterance,
    operatingHours: 'Segunda a Sexta, das 08h às 18h',
  });
  if (detResult.handled) {
    state.deterministicCount++;
    return 'DETERMINISTIC_RESPONSE';
  }
  return 'GENERATIVE';
}

async function executeCase(params) {
  const {
    caseData,
    deps,
    typeSafeAdapter,
    openAiAdapter,
    state,
    logger,
    timeoutMs,
    openAiModelId,
  } = params;
  const isMatched = deps.matchesOperatingHoursCapability(caseData.syntheticCallerUtterance);
  if (isMatched) state.matcherMatchedCount++;
  else state.matcherUnmatchedCount++;

  let jevCalled = false;
  let jevProviderModel = null;
  let jevLatencyMs = null;
  let openAiCalled = false;
  let openAiLatencyMs = null;
  let observedRoute = 'GENERATIVE';
  let technicalStatus = 'SUCCESS';
  let errorCategory = null;
  let shouldStop = false;

  if (!isMatched) {
    openAiCalled = true;
    const res = await executeOpenAiTurn({ openAiAdapter, caseData, state, logger, timeoutMs });
    return buildCaseResult(
      caseData,
      isMatched,
      false,
      null,
      null,
      true,
      res.latencyMs,
      'GENERATIVE',
      res.technicalStatus,
      res.errorCategory,
      res.shouldStop,
      openAiModelId,
    );
  }

  jevCalled = true;
  const jevRes = await evaluateTypeSafeJev({
    typeSafeAdapter,
    caseData,
    state,
    deps,
    logger,
    timeoutMs,
  });
  jevLatencyMs = jevRes.latencyMs;
  jevProviderModel = jevRes.observedModel;

  if (jevRes.errorResult) {
    return buildCaseResult(
      caseData,
      isMatched,
      true,
      jevProviderModel,
      jevLatencyMs,
      false,
      null,
      'GENERATIVE',
      jevRes.errorResult.technicalStatus,
      jevRes.errorResult.errorCategory,
      jevRes.errorResult.shouldStop,
      openAiModelId,
    );
  }

  const policy = deps.interpretFrozenTurnPolicy({
    securityScore: jevRes.output.securityScore,
    deterministicScore: jevRes.output.deterministicScore,
    generativeScore: jevRes.output.generativeScore,
  });

  if (policy === 'SECURITY_ESCALATE') {
    state.securityBlockedCount++;
    observedRoute = 'SECURITY_BLOCKED';
  } else if (policy === 'DETERMINISTIC_CANDIDATE') {
    observedRoute = resolveDeterministicRoute(deps, caseData, state);
  } else {
    observedRoute = 'GENERATIVE';
  }

  if (observedRoute === 'GENERATIVE') {
    openAiCalled = true;
    const openAiRes = await executeOpenAiTurn({
      openAiAdapter,
      caseData,
      state,
      logger,
      timeoutMs,
    });
    openAiLatencyMs = openAiRes.latencyMs;
    technicalStatus = openAiRes.technicalStatus;
    errorCategory = openAiRes.errorCategory;
    shouldStop = openAiRes.shouldStop;
    if (
      isMatched &&
      jevCalled &&
      policy === 'GENERATIVE_REQUIRED' &&
      technicalStatus === 'SUCCESS'
    ) {
      state.coreJointChainObserved = true;
    }
  }

  return buildCaseResult(
    caseData,
    isMatched,
    jevCalled,
    jevProviderModel,
    jevLatencyMs,
    openAiCalled,
    openAiLatencyMs,
    observedRoute,
    technicalStatus,
    errorCategory,
    shouldStop,
    openAiModelId,
  );
}

function buildCaseResult(
  caseData,
  matcherMatched,
  jevCalled,
  jevProviderModel,
  jevLatencyMs,
  openAiCalled,
  openAiLatencyMs,
  observedRoute,
  technicalStatus,
  errorCategory,
  shouldStop,
  openAiModelId,
) {
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
    shouldStop,
  };
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
    metadata: {
      suite: 'phase-6-l2-real-jev-openai-synthetic-integration',
      version: '1.1.0',
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
    },
    aggregates: {
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
    },
    cases: caseResults,
  };
}

export async function runL2Benchmark(options = {}) {
  const isOffline = Boolean(
    options.offlineMode || options.fetchFn || options.fakeTypeSafeFetch || options.fakeOpenAiFetch,
  );
  const { computedHash, cases, approvedCostCeilingUsd } = validatePreconditions(options, isOffline);
  const deps = options.deps ?? (await loadDependencies());
  const logger = options.logger ?? console;
  const timeoutMs = options.timeoutMs ?? RESEARCH_HARNESS_TIMEOUT_MS;

  const fallbackFetch = isOffline ? createDenyNetworkFetch() : undefined;
  const typeSafeApiKey =
    options.typeSafeApiKey ?? (options.customEnv ?? process.env).TYPESAFE_API_KEY;
  const openAiApiKey = options.openAiApiKey ?? (options.customEnv ?? process.env).OPENAI_API_KEY;
  const openAiModelId =
    options.openAiModelId ??
    (options.customEnv ?? process.env).OPENAI_CONVERSATION_MODEL ??
    DEFAULT_OPENAI_MODEL;

  const typeSafeAdapter = new deps.TypeSafeJevTurnDecisionAdapter({
    apiKey: typeSafeApiKey || 'offline-dummy-key',
    model: REQUESTED_TYPESAFE_MODEL,
    expectedProviderModel: EXPECTED_TYPESAFE_MODEL,
    fetchFn: options.fakeTypeSafeFetch ?? options.fetchFn ?? fallbackFetch,
  });

  const openAiAdapter = new deps.OpenAiConversationModelAdapter({
    config: {
      apiKey: openAiApiKey || 'offline-dummy-key',
      modelId: openAiModelId,
      maxCompletionTokens: 500,
    },
    fetchFn: options.fakeOpenAiFetch ?? options.fetchFn ?? fallbackFetch,
  });

  const state = {
    typeSafeRequestsAttempted: 0,
    typeSafeRequestsSucceeded: 0,
    openAiRequestsAttempted: 0,
    openAiRequestsSucceeded: 0,
    totalProviderRequestsAttempted: 0,
    matcherMatchedCount: 0,
    matcherUnmatchedCount: 0,
    deterministicCount: 0,
    generativeCount: 0,
    securityBlockedCount: 0,
    technicalFailures: 0,
    timeouts: 0,
    consecutiveFailures: 0,
    coreJointChainObserved: false,
    typeSafeMismatch: false,
  };

  const caseResults = [];
  let stoppedEarly = false;

  for (let i = 0; i < cases.length; i++) {
    const { result, shouldStop } = await executeCase({
      caseData: cases[i],
      deps,
      typeSafeAdapter,
      openAiAdapter,
      state,
      logger,
      timeoutMs,
      openAiModelId,
    });
    caseResults.push(result);
    logger.log(
      `  [${i + 1}/${cases.length}] ${cases[i].caseId}: route=${result.observedRoute}, status=${result.technicalStatus}`,
    );
    if (state.consecutiveFailures >= 3 || shouldStop) {
      stoppedEarly = true;
      break;
    }
  }

  const classification = classifyRunResult({
    casesEvaluated: caseResults.length,
    totalExpected: cases.length,
    technicalFailures: state.technicalFailures,
    timeouts: state.timeouts,
    typeSafeMismatch: state.typeSafeMismatch,
    coreJointChainObserved: state.coreJointChainObserved,
    stoppedEarly,
  });

  const artifact = buildResultArtifact({
    computedHash,
    cases,
    caseResults,
    state,
    approvedCostCeilingUsd,
    classification,
    openAiModelId,
  });

  if (!options.dryRunWrite) {
    const outPath =
      options.outPath ??
      resolve(
        process.cwd(),
        'docs/research/results/phase-6-l2-real-jev-openai-synthetic-run1.json',
      );
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  }

  return artifact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runL2Benchmark()
    .then((result) => {
      if (result.metadata.classification !== 'PASS_COMPLETE') {
        console.error(`[L2 Runner] Study did not pass: ${result.metadata.classification}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
