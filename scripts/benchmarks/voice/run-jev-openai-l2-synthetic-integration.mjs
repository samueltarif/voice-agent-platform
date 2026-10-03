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

export const TYPESAFE_PRICE_PER_BTOK = 42; // $42 / billion tokens
export const MAX_TYPESAFE_INPUT_TOKENS_PER_REQ = 1000;
export const MAX_PROJECTED_TYPESAFE_COST_USD = Number(
  (
    ((MAX_TYPESAFE_REQUESTS * MAX_TYPESAFE_INPUT_TOKENS_PER_REQ) / 1_000_000_000) *
    TYPESAFE_PRICE_PER_BTOK
  ).toFixed(6),
); // $0.000294 USD

export const PROPOSED_COST_CEILING_USD = 0.25;

export function computeSha256(content) {
  return createHash('sha256').update(content).digest('hex');
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
  if (isTimedOut) {
    return { status: 'TIMEOUT', errorCategory: 'TIMEOUT' };
  }
  const safeName = err instanceof Error ? err.name : 'UnknownError';
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
  if (isTimedOut) {
    return { status: 'TIMEOUT', errorCategory: 'TIMEOUT' };
  }
  const safeName = err instanceof Error ? err.name : 'UnknownError';
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
  const typeSafeAdapterUrl = new URL(
    '../../../packages/integrations/dist/packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.js',
    import.meta.url,
  );
  const openAiAdapterUrl = new URL(
    '../../../packages/integrations/dist/packages/integrations/src/openai/openai-conversation-model-adapter.js',
    import.meta.url,
  );
  const matcherUrl = new URL(
    '../../../apps/voice/dist/apps/voice/src/operating-hours-capability-matcher.js',
    import.meta.url,
  );
  const policyUrl = new URL(
    '../../../apps/voice/dist/apps/voice/src/frozen-policy-interpreter.js',
    import.meta.url,
  );
  const turnHandlerUrl = new URL(
    '../../../apps/voice/dist/apps/voice/src/operating-hours-turn-handler.js',
    import.meta.url,
  );

  const [typeSafeMod, openAiMod, matcherMod, policyMod, turnHandlerMod] = await Promise.all([
    import(typeSafeAdapterUrl.href),
    import(openAiAdapterUrl.href),
    import(matcherUrl.href),
    import(policyUrl.href),
    import(turnHandlerUrl.href),
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

export async function runL2Benchmark(options = {}) {
  const isOffline = Boolean(options.offlineMode || options.fetchFn || options.fakeTypeSafeFetch);
  let approvedCostCeilingUsd = 0;

  if (!isOffline) {
    approvedCostCeilingUsd =
      options.costCeilingUsd !== undefined
        ? options.costCeilingUsd
        : parseCostCeiling(options.customArgs, options.customEnv);

    if (MAX_PROJECTED_TYPESAFE_COST_USD > approvedCostCeilingUsd) {
      throw new Error(
        `FATAL: MAX_PROJECTED_TYPESAFE_COST_USD (${MAX_PROJECTED_TYPESAFE_COST_USD}) exceeds approved cost ceiling (${approvedCostCeilingUsd}).`,
      );
    }
  }

  const datasetPath =
    options.datasetPath ??
    resolve(
      process.cwd(),
      'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
    );
  const outPath =
    options.outPath ??
    resolve(process.cwd(), 'docs/research/results/phase-6-l2-real-jev-openai-synthetic-run1.json');

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

  const deps = options.deps ?? (await loadDependencies());
  const logger = options.logger ?? console;

  const typeSafeApiKey =
    options.typeSafeApiKey ?? (options.customEnv ?? process.env).TYPESAFE_API_KEY;
  if (!typeSafeApiKey && !isOffline) {
    throw new Error('FATAL: TYPESAFE_API_KEY is not defined in environment');
  }

  const openAiApiKey = options.openAiApiKey ?? (options.customEnv ?? process.env).OPENAI_API_KEY;
  if (!openAiApiKey && !isOffline) {
    throw new Error('FATAL: OPENAI_API_KEY is not defined in environment');
  }

  const openAiModelId =
    options.openAiModelId ??
    (options.customEnv ?? process.env).OPENAI_CONVERSATION_MODEL ??
    DEFAULT_OPENAI_MODEL;

  const typeSafeAdapter = new deps.TypeSafeJevTurnDecisionAdapter({
    apiKey: typeSafeApiKey || 'offline-dummy-key',
    model: REQUESTED_TYPESAFE_MODEL,
    expectedProviderModel: EXPECTED_TYPESAFE_MODEL,
    fetchFn: options.fakeTypeSafeFetch ?? options.fetchFn,
  });

  const openAiAdapter = new deps.OpenAiConversationModelAdapter({
    config: {
      apiKey: openAiApiKey || 'offline-dummy-key',
      modelId: openAiModelId,
      maxCompletionTokens: 500,
    },
    fetchFn: options.fakeOpenAiFetch ?? options.fetchFn,
  });

  logger.log(`[L2 Runner] Initialized L2 Synthetic Integration Runner`);
  logger.log(`[L2 Runner] Dataset SHA-256: ${computedHash} (VERIFIED)`);
  logger.log(`[L2 Runner] Total Cases: ${cases.length}`);
  logger.log(`[L2 Runner] TypeSafe Model: ${REQUESTED_TYPESAFE_MODEL}`);
  logger.log(`[L2 Runner] OpenAI Model: ${openAiModelId}`);
  logger.log(
    `[L2 Runner] Caps: TypeSafe <= ${MAX_TYPESAFE_REQUESTS}, OpenAI <= ${MAX_OPENAI_REQUESTS}, Total <= ${TOTAL_MAX_PROVIDER_REQUESTS}`,
  );
  logger.log(`[L2 Runner] Concurrency: ${CONCURRENCY} (SERIAL) | Retries: ${RETRIES}`);

  let typeSafeRequestsAttempted = 0;
  let typeSafeRequestsSucceeded = 0;
  let openAiRequestsAttempted = 0;
  let openAiRequestsSucceeded = 0;
  let totalProviderRequestsAttempted = 0;

  let matcherMatchedCount = 0;
  let matcherUnmatchedCount = 0;
  let deterministicCount = 0;
  let generativeCount = 0;
  let securityBlockedCount = 0;
  let technicalFailures = 0;
  let timeouts = 0;
  let consecutiveTechnicalFailures = 0;
  let coreJointChainObserved = false;

  const caseResults = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const isMatched = deps.matchesOperatingHoursCapability(c.syntheticCallerUtterance);

    if (isMatched) {
      matcherMatchedCount++;
    } else {
      matcherUnmatchedCount++;
    }

    let jevCalled = false;
    let jevProviderModel = null;
    let jevLatencyMs = null;
    let openAiCalled = false;
    let openAiLatencyMs = null;
    let observedRoute = 'GENERATIVE';
    let technicalStatus = 'SUCCESS';
    let errorCategory = null;
    let shouldStopAfterCase = false;

    if (!isMatched) {
      // Group C / Group D (Matcher = false): Jev is suppressed!
      jevCalled = false;

      // Single-owner: Fallback to generative (OpenAI)
      if (
        openAiRequestsAttempted >= MAX_OPENAI_REQUESTS ||
        totalProviderRequestsAttempted >= TOTAL_MAX_PROVIDER_REQUESTS
      ) {
        logger.error(`[L2 Runner] Hard cap reached before OpenAI request on ${c.caseId}`);
        technicalStatus = 'PROVIDER_ERROR';
        errorCategory = 'MAX_OPENAI_REQUESTS_EXCEEDED';
        technicalFailures++;
        shouldStopAfterCase = true;
      } else {
        openAiRequestsAttempted++;
        totalProviderRequestsAttempted++;
        openAiCalled = true;
        const openAiStart = Date.now();
        try {
          const stream = await openAiAdapter.streamTurn({
            turnId: c.caseId,
            generationId: `gen-${c.caseId}`,
            messages: [
              { role: 'system', content: 'Você é um assistente virtual profissional.' },
              { role: 'user', content: c.syntheticCallerUtterance },
            ],
          });

          for await (const chunk of stream) {
            if (chunk.type === 'failure') {
              throw new Error(chunk.error || 'OpenAI stream failure');
            }
          }
          openAiLatencyMs = Math.max(0, Date.now() - openAiStart);
          openAiRequestsSucceeded++;
          generativeCount++;
          consecutiveTechnicalFailures = 0;
        } catch (err) {
          openAiLatencyMs = Math.max(0, Date.now() - openAiStart);
          const classification = classifyOpenAiError(err, false);
          technicalStatus = classification.status;
          errorCategory = classification.errorCategory;
          technicalFailures++;
          consecutiveTechnicalFailures++;

          if (classification.status === 'HTTP_AUTH_ERROR') {
            logger.error(`[L2 Runner] STOP: OpenAI HTTP Auth error. Aborting.`);
            shouldStopAfterCase = true;
          }
        }
      }
    } else {
      // Group A / Group B (Matcher = true): Evaluate TypeSafe Jev first
      if (
        typeSafeRequestsAttempted >= MAX_TYPESAFE_REQUESTS ||
        totalProviderRequestsAttempted >= TOTAL_MAX_PROVIDER_REQUESTS
      ) {
        logger.error(`[L2 Runner] Hard cap reached before TypeSafe request on ${c.caseId}`);
        technicalStatus = 'PROVIDER_ERROR';
        errorCategory = 'MAX_TYPESAFE_REQUESTS_EXCEEDED';
        technicalFailures++;
        shouldStopAfterCase = true;
      } else {
        typeSafeRequestsAttempted++;
        totalProviderRequestsAttempted++;
        jevCalled = true;

        const jevStart = Date.now();
        let jevOutput = null;

        try {
          jevOutput = await typeSafeAdapter.evaluateTurn({
            organizationId: '00000000-0000-0000-0000-000000000000',
            callId: `l2-call-${c.caseId}`,
            turnId: c.caseId,
            callerTranscript: c.syntheticCallerUtterance,
            language: 'pt-BR',
            channel: 'phone',
          });
          jevLatencyMs = jevOutput.latencyMs ?? Math.max(0, Date.now() - jevStart);
          jevProviderModel = jevOutput.providerModel;
          typeSafeRequestsSucceeded++;
          consecutiveTechnicalFailures = 0;
        } catch (err) {
          jevLatencyMs = Math.max(0, Date.now() - jevStart);
          const classification = classifyTypeSafeError(err, false);
          technicalStatus = classification.status;
          errorCategory = classification.errorCategory;
          technicalFailures++;
          consecutiveTechnicalFailures++;

          if (err instanceof deps.TypeSafeModelIdentityMismatchError) {
            jevProviderModel = err.observedModel;
            logger.error(
              `[L2 Runner] STOP: TypeSafe Model Identity Mismatch (${err.observedModel}). Aborting.`,
            );
            shouldStopAfterCase = true;
          }

          if (classification.status === 'HTTP_AUTH_ERROR') {
            logger.error(`[L2 Runner] STOP: TypeSafe HTTP Auth error. Aborting.`);
            shouldStopAfterCase = true;
          }
        }

        if (jevOutput && !shouldStopAfterCase) {
          const policyClassification = deps.interpretFrozenTurnPolicy({
            securityScore: jevOutput.securityScore,
            deterministicScore: jevOutput.deterministicScore,
            generativeScore: jevOutput.generativeScore,
          });

          if (policyClassification === 'SECURITY_ESCALATE') {
            observedRoute = 'SECURITY_BLOCKED';
            securityBlockedCount++;
            openAiCalled = false;
          } else if (policyClassification === 'DETERMINISTIC_CANDIDATE') {
            const detResult = deps.handleOperatingHoursTurn({
              sessionOrganizationId: '00000000-0000-0000-0000-000000000000',
              configurationOrganizationId: '00000000-0000-0000-0000-000000000000',
              callerTranscript: c.syntheticCallerUtterance,
              operatingHours: 'Segunda a Sexta, das 08h às 18h',
            });

            if (detResult.handled) {
              observedRoute = 'DETERMINISTIC_RESPONSE';
              deterministicCount++;
              openAiCalled = false;
            } else {
              // If handler failed closed, single owner falls back to GENERATIVE
              observedRoute = 'GENERATIVE';
            }
          } else {
            // GENERATIVE_REQUIRED
            observedRoute = 'GENERATIVE';
          }

          // If observed route is GENERATIVE, call OpenAI
          if (observedRoute === 'GENERATIVE') {
            if (
              openAiRequestsAttempted >= MAX_OPENAI_REQUESTS ||
              totalProviderRequestsAttempted >= TOTAL_MAX_PROVIDER_REQUESTS
            ) {
              logger.error(`[L2 Runner] Hard cap reached before OpenAI request on ${c.caseId}`);
              technicalStatus = 'PROVIDER_ERROR';
              errorCategory = 'MAX_OPENAI_REQUESTS_EXCEEDED';
              technicalFailures++;
              shouldStopAfterCase = true;
            } else {
              openAiRequestsAttempted++;
              totalProviderRequestsAttempted++;
              openAiCalled = true;

              const openAiStart = Date.now();
              try {
                const stream = await openAiAdapter.streamTurn({
                  turnId: c.caseId,
                  generationId: `gen-${c.caseId}`,
                  messages: [
                    { role: 'system', content: 'Você é um assistente virtual profissional.' },
                    { role: 'user', content: c.syntheticCallerUtterance },
                  ],
                });

                for await (const chunk of stream) {
                  if (chunk.type === 'failure') {
                    throw new Error(chunk.error || 'OpenAI stream failure');
                  }
                }
                openAiLatencyMs = Math.max(0, Date.now() - openAiStart);
                openAiRequestsSucceeded++;
                generativeCount++;
                consecutiveTechnicalFailures = 0;

                // Core joint chain check: matcher=true -> Jev=true -> GENERATIVE_REQUIRED -> OpenAI=true -> success
                if (isMatched && jevCalled && policyClassification === 'GENERATIVE_REQUIRED') {
                  coreJointChainObserved = true;
                }
              } catch (err) {
                openAiLatencyMs = Math.max(0, Date.now() - openAiStart);
                const classification = classifyOpenAiError(err, false);
                technicalStatus = classification.status;
                errorCategory = classification.errorCategory;
                technicalFailures++;
                consecutiveTechnicalFailures++;

                if (classification.status === 'HTTP_AUTH_ERROR') {
                  logger.error(`[L2 Runner] STOP: OpenAI HTTP Auth error. Aborting.`);
                  shouldStopAfterCase = true;
                }
              }
            }
          }
        }
      }
    }

    caseResults.push({
      caseId: c.caseId,
      intendedStimulusClass: c.intendedStimulusClass,
      matcherMatched: isMatched,
      jevCalled,
      jevProviderModel,
      observedRoute,
      openAiCalled,
      openAiModel: openAiCalled ? openAiModelId : null,
      technicalStatus,
      jevLatencyMs,
      openAiLatencyMs,
      errorCategory,
    });

    logger.log(
      `  [${i + 1}/${cases.length}] ${c.caseId}: route=${observedRoute}, matcher=${isMatched}, jev=${jevCalled}, openAi=${openAiCalled}, status=${technicalStatus}`,
    );

    if (consecutiveTechnicalFailures >= 3) {
      logger.error(
        `[L2 Runner] STOP: 3 consecutive technical failures observed. RESEARCH_SAFETY_HEURISTIC stop.`,
      );
      break;
    }

    if (shouldStopAfterCase) {
      break;
    }
  }

  const resultArtifact = {
    metadata: {
      suite: 'phase-6-l2-real-jev-openai-synthetic-integration',
      version: '1.0.0',
      executedAt: new Date().toISOString(),
      datasetPath: 'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
      datasetSha256: computedHash,
      datasetCaseCount: cases.length,
      requestedTypeSafeModel: REQUESTED_TYPESAFE_MODEL,
      expectedTypeSafeModel: EXPECTED_TYPESAFE_MODEL,
      requestedOpenAiModel: openAiModelId,
      maxTypeSafeRequests: MAX_TYPESAFE_REQUESTS,
      maxOpenAiRequests: MAX_OPENAI_REQUESTS,
      totalMaxProviderRequests: TOTAL_MAX_PROVIDER_REQUESTS,
      concurrency: CONCURRENCY,
      retries: RETRIES,
      customerData: 0,
      twilioCalls: 0,
      projectedCostCeilingUsd: approvedCostCeilingUsd,
      pricePerBtokTypeSafe: TYPESAFE_PRICE_PER_BTOK,
    },
    aggregates: {
      matcherEvaluations: cases.length,
      matcherMatchedCount,
      matcherUnmatchedCount,
      typeSafeRequestsAttempted,
      typeSafeRequestsSucceeded,
      openAiRequestsAttempted,
      openAiRequestsSucceeded,
      totalProviderRequestsAttempted,
      deterministicCount,
      generativeCount,
      securityBlockedCount,
      coreJointChainObserved,
      technicalFailures,
      timeouts,
      estimatedUpperBoundCostUsd: Number(
        (
          ((typeSafeRequestsAttempted * MAX_TYPESAFE_INPUT_TOKENS_PER_REQ) / 1_000_000_000) *
          TYPESAFE_PRICE_PER_BTOK
        ).toFixed(6),
      ),
    },
    cases: caseResults,
  };

  if (!options.dryRunWrite) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(resultArtifact, null, 2) + '\n', 'utf8');
    logger.log(`[L2 Runner] Results written to: ${outPath}`);
  }

  return resultArtifact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runL2Benchmark().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
