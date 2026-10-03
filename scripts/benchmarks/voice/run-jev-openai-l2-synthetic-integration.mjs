#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export * from './l2-runner-preconditions.mjs';
export * from './l2-runner-cost-ceiling.mjs';
export * from './l2-runner-request-caps.mjs';
export * from './l2-runner-input-budget.mjs';
export * from './l2-runner-result-classification.mjs';
export * from './l2-runner-artifact.mjs';
export * from './l2-runner-dependencies.mjs';
export * from './l2-runner-provider-dispatch.mjs';
export * from './l2-runner-case-execution.mjs';

import {
  EXPECTED_TYPESAFE_MODEL,
  REQUESTED_TYPESAFE_MODEL,
  DEFAULT_OPENAI_MODEL,
  RESEARCH_HARNESS_TIMEOUT_MS,
  validatePreconditions,
  createDenyNetworkFetch,
  parseCliArgs,
} from './l2-runner-preconditions.mjs';
import { classifyRunResult } from './l2-runner-result-classification.mjs';
import { buildResultArtifact } from './l2-runner-artifact.mjs';
import { loadDependencies, createInitialState } from './l2-runner-dependencies.mjs';
import { executeCase } from './l2-runner-case-execution.mjs';

function writeArtifactIfNeeded(artifact, options) {
  if (options.dryRunWrite) return;
  const outPath =
    options.outPath ??
    resolve(process.cwd(), 'docs/research/results/phase-6-l2-real-jev-openai-synthetic-run1.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
}

function createRunnerAdapters({ deps, options, isOffline, openAiModelId }) {
  const fallbackFetch = isOffline ? createDenyNetworkFetch() : undefined;
  const env = options.customEnv ?? process.env;
  const typeSafeApiKey = options.typeSafeApiKey ?? env.TYPESAFE_API_KEY;
  const openAiApiKey = options.openAiApiKey ?? env.OPENAI_API_KEY;
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
  return { typeSafeAdapter, openAiAdapter };
}

async function executeBenchmarkCases({
  cases,
  deps,
  typeSafeAdapter,
  openAiAdapter,
  state,
  logger,
  timeoutMs,
  openAiModelId,
}) {
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
  return { caseResults, stoppedEarly };
}

export async function runL2Benchmark(options = {}) {
  const isOffline =
    options.offlineMode !== undefined
      ? Boolean(options.offlineMode)
      : Boolean(options.fetchFn || options.fakeTypeSafeFetch || options.fakeOpenAiFetch);
  const { computedHash, cases, approvedCostCeilingUsd } = validatePreconditions(options, isOffline);
  const deps = options.deps ?? (await loadDependencies());
  const logger = options.logger ?? console;
  const timeoutMs = options.timeoutMs ?? RESEARCH_HARNESS_TIMEOUT_MS;
  const env = options.customEnv ?? process.env;
  const openAiModelId =
    options.openAiModelId ?? env.OPENAI_CONVERSATION_MODEL ?? DEFAULT_OPENAI_MODEL;
  const { typeSafeAdapter, openAiAdapter } = createRunnerAdapters({
    deps,
    options,
    isOffline,
    openAiModelId,
  });
  const state = createInitialState();
  const { caseResults, stoppedEarly } = await executeBenchmarkCases({
    cases,
    deps,
    typeSafeAdapter,
    openAiAdapter,
    state,
    logger,
    timeoutMs,
    openAiModelId,
  });
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
  writeArtifactIfNeeded(artifact, options);
  return artifact;
}

export async function executeCli(args = process.argv.slice(2), env = process.env, customLogger) {
  const cliOptions = parseCliArgs(args);
  cliOptions.customArgs = args;
  cliOptions.customEnv = env;
  const logger = customLogger ?? console;
  try {
    const result = await runL2Benchmark({ ...cliOptions, logger });
    if (result.metadata.classification !== 'PASS_COMPLETE') {
      logger.error(`[L2 Runner] Study did not pass: ${result.metadata.classification}`);
      return 1;
    }
    return 0;
  } catch (err) {
    logger.error(err?.message || String(err));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executeCli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
