#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AUTHORIZED_V2_OPENAI_MODEL,
  AUTHORIZED_V2_TYPESAFE_MODEL,
  validateAuthorizedLivePreconditions,
} from './l2-mixed-intent-v2-authorized-preconditions.mjs';
import {
  EXPECTED_V2_CASE_COUNT,
  V2_DEFAULT_OPENAI_MODEL,
  V2_RESEARCH_HARNESS_TIMEOUT_MS,
  loadV2Dependencies,
} from './run-jev-openai-l2-mixed-intent-v2.mjs';
import { createV2InitialState } from './l2-mixed-intent-v2-case-execution.mjs';
import { executeMixedIntentV2Case } from './l2-mixed-intent-v2-case-execution.mjs';
import { classifyV2RunResult } from './l2-mixed-intent-v2-result-classification.mjs';
import { buildV2ResultArtifact } from './l2-mixed-intent-v2-artifact.mjs';

export function parseAuthorizedV2CliArgs(customArgs) {
  const args = customArgs ?? process.argv.slice(2);
  const options = {
    allowLiveExecution: false,
    acceptTypesafeEmpiricalPricing: false,
    costCeilingUsd: undefined,
    datasetPath: undefined,
    outPath: undefined,
    dryRunWrite: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--allow-live') options.allowLiveExecution = true;
    else if (arg === '--accept-typesafe-empirical-pricing')
      options.acceptTypesafeEmpiricalPricing = true;
    else if (arg === '--dry-run-write') options.dryRunWrite = true;
    else if (arg === '--cost-ceiling' && args[i + 1]) options.costCeilingUsd = Number(args[++i]);
    else if (arg === '--dataset' && args[i + 1]) options.datasetPath = args[++i];
    else if (arg === '--out' && args[i + 1]) options.outPath = args[++i];
  }
  return options;
}

function createRealV2Adapters({ deps, options, openAiModelId }) {
  const typeSafeApiKey = options.typeSafeApiKey;
  if (!typeSafeApiKey) {
    throw new Error('FATAL_V2_CREDENTIAL_ABSENT: TypeSafe API key required before dispatch.');
  }
  const openAiApiKey = options.openAiApiKey;
  if (!openAiApiKey) {
    throw new Error('FATAL_V2_CREDENTIAL_ABSENT: OpenAI API key required before dispatch.');
  }
  const typeSafeAdapter = new deps.TypeSafeJevTurnDecisionAdapter({
    apiKey: typeSafeApiKey,
    model: AUTHORIZED_V2_TYPESAFE_MODEL,
    expectedProviderModel: AUTHORIZED_V2_TYPESAFE_MODEL,
  });
  const openAiAdapter = new deps.OpenAiConversationModelAdapter({
    config: {
      apiKey: openAiApiKey,
      modelId: openAiModelId,
      maxCompletionTokens: 500,
    },
  });
  return { typeSafeAdapter, openAiAdapter };
}

export async function runAuthorizedV2Study(options = {}) {
  const pre = validateAuthorizedLivePreconditions(options);
  const authorization = options.authorization;
  const useRealAdapters = options.useRealAdapters === true;
  const deps = options.deps ?? (await loadV2Dependencies());
  const logger = options.logger ?? console;
  const timeoutMs = options.timeoutMs ?? V2_RESEARCH_HARNESS_TIMEOUT_MS;
  const openAiModelId =
    options.openAiModelId ?? V2_DEFAULT_OPENAI_MODEL ?? AUTHORIZED_V2_OPENAI_MODEL;
  const adapters =
    options.typeSafeAdapter && options.openAiAdapter
      ? { typeSafeAdapter: options.typeSafeAdapter, openAiAdapter: options.openAiAdapter }
      : createRealV2Adapters({ deps, options, openAiModelId });
  const state = createV2InitialState();
  const caseEvidences = [];
  let stoppedEarly = false;
  for (let i = 0; i < pre.cases.length; i++) {
    const { evidence, shouldStop } = await executeMixedIntentV2Case({
      caseData: pre.cases[i],
      deps,
      ...adapters,
      state,
      logger,
      timeoutMs,
      openAiModelId,
    });
    caseEvidences.push(evidence);
    logger.log(
      `  [${i + 1}/${pre.cases.length}] ${pre.cases[i].id}: policy=${evidence.policyOutcome}, criterionAV2Pass=${evidence.criterionAV2Pass}`,
    );
    if (state.consecutiveFailures >= 3 || shouldStop) {
      stoppedEarly = true;
      break;
    }
  }
  const classification = classifyV2RunResult({
    casesEvaluated: caseEvidences.length,
    totalExpected: EXPECTED_V2_CASE_COUNT,
    technicalFailures: state.technicalFailures,
    timeouts: state.timeouts,
    typeSafeMismatch: state.typeSafeMismatch,
    stoppedEarly,
    criterionPassObserved: state.criterionAV2PassObserved,
  });
  const artifact = buildV2ResultArtifact({
    datasetSha256: pre.datasetSha256,
    cases: pre.cases,
    caseEvidences,
    state,
    classification,
    openAiModelId,
  });
  artifact.metadata.studyIdentity = 'phase-6-l2-joint-chain-mixed-intent-v2';
  artifact.metadata.offlineFreezeSha256 = pre.offlineFreezeSha256;
  artifact.metadata.authorizedLiveFreezeSha256 = pre.liveFreezeSha256;
  artifact.metadata.authorizedLiveFreezeModuleCount = pre.liveFreezeModuleCount;
  artifact.metadata.authorizationScope = 'ONE_TARGETED_V2_SYNTHETIC_STUDY';
  artifact.metadata.authorizationGranted = authorization.granted === true;
  artifact.metadata.authorizationConsumed = useRealAdapters === true;
  artifact.metadata.providerExecutionStatus =
    useRealAdapters === true ? 'LIVE_DISPATCHED' : 'FAKE_OFFLINE_VALIDATION';
  artifact.metadata.operatorCeilingUsd = pre.ceilingUsd;
  artifact.metadata.planningEstimateUsd = pre.planningEstimateUsd;
  artifact.metadata.costEstimateClassification = 'PLANNING_ESTIMATE_NOT_HARD_BOUND';
  if (!options.dryRunWrite && useRealAdapters === true) {
    const outPath =
      options.outPath ??
      resolve(process.cwd(), 'docs/research/results/phase-6-l2-mixed-intent-v2-live-run1.json');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  }
  return artifact;
}

export async function executeAuthorizedV2Cli(args = process.argv.slice(2), customLogger) {
  const cliOptions = parseAuthorizedV2CliArgs(args);
  const logger = customLogger ?? console;
  try {
    const result = await runAuthorizedV2Study({
      ...cliOptions,
      useRealAdapters: true,
      logger,
    });
    if (result.metadata.classification !== 'PASS_COMPLETE') {
      logger.error(
        `[L2 V2 Authorized Study] Study did not pass: ${result.metadata.classification}`,
      );
      return 1;
    }
    return 0;
  } catch (err) {
    logger.error(err?.message || String(err));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executeAuthorizedV2Cli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
