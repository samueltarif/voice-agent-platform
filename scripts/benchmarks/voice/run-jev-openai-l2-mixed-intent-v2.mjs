#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export * from './l2-mixed-intent-v2-request-caps.mjs';
export * from './l2-mixed-intent-v2-result-classification.mjs';
export * from './l2-mixed-intent-v2-provider-dispatch.mjs';
export * from './l2-mixed-intent-v2-case-execution.mjs';
export * from './l2-mixed-intent-v2-artifact.mjs';
import { OfflineNetworkDeniedError } from './l2-runner-preconditions.mjs';
import {
  createV2InitialState,
  executeMixedIntentV2Case,
} from './l2-mixed-intent-v2-case-execution.mjs';
import { classifyV2RunResult } from './l2-mixed-intent-v2-result-classification.mjs';
import { buildV2ResultArtifact } from './l2-mixed-intent-v2-artifact.mjs';

export const EXPECTED_V2_DATASET_SHA256 =
  'ade86008b360b90754e2ac95a560d381e7adc655ecb20d09f2a28077faf9c690';
export const EXPECTED_V2_CASE_COUNT = 4;
export const V2_RESEARCH_HARNESS_TIMEOUT_MS = 5000;
export const V2_DEFAULT_OPENAI_MODEL = 'gpt-6-astra';
export const V2_LIVE_AUTHORIZED = false;

export function computeV2Sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function parseV2CliArgs(customArgs) {
  const args = customArgs ?? process.argv.slice(2);
  const options = {
    allowLiveExecution: false,
    offlineMode: false,
    dryRunWrite: false,
    datasetPath: undefined,
    outPath: undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--allow-live') options.allowLiveExecution = true;
    else if (arg === '--offline') options.offlineMode = true;
    else if (arg === '--dry-run-write') options.dryRunWrite = true;
    else if (arg === '--dataset' && args[i + 1]) options.datasetPath = args[++i];
    else if (arg === '--out' && args[i + 1]) options.outPath = args[++i];
  }
  return options;
}

export function validateV2Dataset(options) {
  const datasetPath =
    options.datasetPath ??
    resolve(
      process.cwd(),
      'scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json',
    );
  const raw = readFileSync(datasetPath, 'utf8');
  const datasetSha256 = computeV2Sha256(raw);
  if (datasetSha256 !== EXPECTED_V2_DATASET_SHA256) {
    throw new Error(
      `FATAL: V2 dataset SHA-256 mismatch. Expected ${EXPECTED_V2_DATASET_SHA256}, got ${datasetSha256}`,
    );
  }
  const parsed = JSON.parse(raw);
  const cases = parsed.cases ?? [];
  if (cases.length !== EXPECTED_V2_CASE_COUNT) {
    throw new Error(
      `FATAL: Expected exactly ${EXPECTED_V2_CASE_COUNT} v2 cases, found ${cases.length}`,
    );
  }
  return { datasetPath, datasetSha256, cases };
}

export async function loadV2Dependencies() {
  const [typeSafeMod, openAiMod, matcherMod, involvementMod, policyMod, turnHandlerMod] =
    await Promise.all([
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
          '../../../apps/voice/dist/apps/voice/src/operating-hours-involvement.js',
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
    resolveOperatingHoursInvolvement: involvementMod.resolveOperatingHoursInvolvement,
    interpretFrozenTurnPolicy: policyMod.interpretFrozenTurnPolicy,
    handleOperatingHoursTurn: turnHandlerMod.handleOperatingHoursTurn,
  };
}

function createDenyFetch() {
  return async () => {
    throw new OfflineNetworkDeniedError();
  };
}

function createV2RunnerAdapters({ deps, options, openAiModelId }) {
  const fallbackFetch = createDenyFetch();
  const env = options.customEnv ?? process.env;
  const typeSafeAdapter = new deps.TypeSafeJevTurnDecisionAdapter({
    apiKey: options.typeSafeApiKey ?? env.TYPESAFE_API_KEY ?? 'offline-dummy-key',
    model: 'jev-1.13.0',
    expectedProviderModel: 'jev-1.13.0',
    fetchFn: options.fakeTypeSafeFetch ?? options.fetchFn ?? fallbackFetch,
  });
  const openAiAdapter = new deps.OpenAiConversationModelAdapter({
    config: {
      apiKey: options.openAiApiKey ?? env.OPENAI_API_KEY ?? 'offline-dummy-key',
      modelId: openAiModelId,
      maxCompletionTokens: 500,
    },
    fetchFn: options.fakeOpenAiFetch ?? options.fetchFn ?? fallbackFetch,
  });
  return { typeSafeAdapter, openAiAdapter };
}

export async function runMixedIntentV2Benchmark(options = {}) {
  const isOffline = options.offlineMode !== undefined ? Boolean(options.offlineMode) : true;
  if (!isOffline) {
    throw new Error(
      'FATAL_LIVE_NOT_AUTHORIZED: Mixed-intent L2 v2 live execution is not authorized in slice 006BF.',
    );
  }
  void V2_LIVE_AUTHORIZED;
  const { datasetSha256, cases } = validateV2Dataset(options);
  const deps = options.deps ?? (await loadV2Dependencies());
  const logger = options.logger ?? console;
  const timeoutMs = options.timeoutMs ?? V2_RESEARCH_HARNESS_TIMEOUT_MS;
  const openAiModelId = options.openAiModelId ?? V2_DEFAULT_OPENAI_MODEL;
  const adapters =
    options.typeSafeAdapter && options.openAiAdapter
      ? { typeSafeAdapter: options.typeSafeAdapter, openAiAdapter: options.openAiAdapter }
      : createV2RunnerAdapters({ deps, options, openAiModelId });
  const state = createV2InitialState();
  const caseEvidences = [];
  let stoppedEarly = false;
  for (let i = 0; i < cases.length; i++) {
    const { evidence, shouldStop } = await executeMixedIntentV2Case({
      caseData: cases[i],
      deps,
      ...adapters,
      state,
      logger,
      timeoutMs,
      openAiModelId,
    });
    caseEvidences.push(evidence);
    logger.log(
      `  [${i + 1}/${cases.length}] ${cases[i].id}: policy=${evidence.policyOutcome}, criterionAV2Pass=${evidence.criterionAV2Pass}`,
    );
    if (state.consecutiveFailures >= 3 || shouldStop) {
      stoppedEarly = true;
      break;
    }
  }
  const classification = classifyV2RunResult({
    casesEvaluated: caseEvidences.length,
    totalExpected: cases.length,
    technicalFailures: state.technicalFailures,
    timeouts: state.timeouts,
    typeSafeMismatch: state.typeSafeMismatch,
    stoppedEarly,
    criterionPassObserved: state.criterionAV2PassObserved,
  });
  const artifact = buildV2ResultArtifact({
    datasetSha256,
    cases,
    caseEvidences,
    state,
    classification,
    openAiModelId,
  });
  if (!options.dryRunWrite) {
    const outPath =
      options.outPath ??
      resolve(process.cwd(), 'docs/research/results/phase-6-l2-mixed-intent-v2-run1.json');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  }
  return artifact;
}

export async function executeV2Cli(args = process.argv.slice(2), customLogger) {
  const cliOptions = parseV2CliArgs(args);
  cliOptions.offlineMode = cliOptions.offlineMode || !cliOptions.allowLiveExecution;
  const logger = customLogger ?? console;
  try {
    const result = await runMixedIntentV2Benchmark({ ...cliOptions, logger });
    if (result.metadata.classification !== 'PASS_COMPLETE') {
      logger.error(`[L2 V2 Runner] Study did not pass: ${result.metadata.classification}`);
      return 1;
    }
    return 0;
  } catch (err) {
    logger.error(err?.message || String(err));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executeV2Cli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
