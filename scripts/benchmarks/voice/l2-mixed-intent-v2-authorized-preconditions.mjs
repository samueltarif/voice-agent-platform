import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  EXPECTED_V2_CASE_COUNT,
  EXPECTED_V2_DATASET_SHA256,
} from './run-jev-openai-l2-mixed-intent-v2.mjs';
import {
  MAX_V2_OPENAI_REQUESTS,
  MAX_V2_TYPESAFE_REQUESTS,
  V2_CONCURRENCY,
  V2_RETRIES,
  V2_TOTAL_MAX_PROVIDER_REQUESTS,
} from './l2-mixed-intent-v2-request-caps.mjs';
import { computeMixedIntentV2Freeze } from './compute-l2-mixed-intent-v2-executable-freeze.mjs';
import { computeAuthorizedV2LiveFreeze } from './compute-l2-mixed-intent-v2-live-executable-freeze.mjs';

export const AUTHORIZED_V2_STUDY_ID = 'phase-6-l2-joint-chain-mixed-intent-v2';

export const AUTHORIZED_V2_DATASET_PATH =
  'scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json';

export const AUTHORIZED_V2_DATASET_SHA256 = EXPECTED_V2_DATASET_SHA256;

export const AUTHORIZED_V2_OFFLINE_FREEZE_SHA256 =
  '6fdc0827dd4dff4dab49f2c8f5a4e82d3024614680ea23106531c8a954ef1f2e';

export const EXPECTED_AUTHORIZED_V2_LIVE_MODULE_COUNT = 3;

export const AUTHORIZED_V2_TYPESAFE_MODEL = 'jev-1.13.0';

export const AUTHORIZED_V2_OPENAI_MODEL = 'gpt-6-astra';

export const AUTHORIZED_OPERATOR_COST_CEILING_USD = 0.5;

export const V2_LIVE_TYPESAFE_PLANNING_INPUT_TOKENS_PER_REQ = 1000;

export const V2_LIVE_OPENAI_PLANNING_INPUT_TOKENS_PER_REQ = 1500;

export const V2_LIVE_OPENAI_PLANNING_OUTPUT_TOKENS_PER_REQ = 500;

export const V2_LIVE_TYPESAFE_PLANNING_RATE_USD_PER_BTOK = 42;

export const V2_LIVE_OPENAI_PLANNING_RATE_USD_PER_MTOK_INPUT = 10;

export const V2_LIVE_OPENAI_PLANNING_RATE_USD_PER_MTOK_OUTPUT = 50;

export function computeV2LivePlanningEstimateUsd() {
  const typeSafe =
    ((MAX_V2_TYPESAFE_REQUESTS * V2_LIVE_TYPESAFE_PLANNING_INPUT_TOKENS_PER_REQ) / 1_000_000_000) *
    V2_LIVE_TYPESAFE_PLANNING_RATE_USD_PER_BTOK;
  const openAiInput =
    ((MAX_V2_OPENAI_REQUESTS * V2_LIVE_OPENAI_PLANNING_INPUT_TOKENS_PER_REQ) / 1_000_000) *
    V2_LIVE_OPENAI_PLANNING_RATE_USD_PER_MTOK_INPUT;
  const openAiOutput =
    ((MAX_V2_OPENAI_REQUESTS * V2_LIVE_OPENAI_PLANNING_OUTPUT_TOKENS_PER_REQ) / 1_000_000) *
    V2_LIVE_OPENAI_PLANNING_RATE_USD_PER_MTOK_OUTPUT;
  return Number((typeSafe + openAiInput + openAiOutput).toFixed(6));
}

export function validateAuthorizedLivePreconditions(options = {}) {
  if (options.allowLiveExecution !== true) {
    throw new Error(
      'FATAL_LIVE_INTENT_DENIED: Authorized v2 live study requires explicit live intent (allowLiveExecution: true).',
    );
  }
  const authorization = options.authorization;
  if (!authorization || typeof authorization !== 'object') {
    throw new Error('FATAL_LIVE_AUTHORIZATION_MISSING: No human authorization supplied.');
  }
  if (authorization.studyId !== AUTHORIZED_V2_STUDY_ID) {
    throw new Error(
      `FATAL_LIVE_STUDY_MISMATCH: Authorized study is ${AUTHORIZED_V2_STUDY_ID}, got ${authorization.studyId}.`,
    );
  }
  if (authorization.granted !== true) {
    throw new Error('FATAL_LIVE_AUTHORIZATION_MISSING: Authorization not granted.');
  }
  if (authorization.consumed === true) {
    throw new Error('FATAL_LIVE_AUTHORIZATION_CONSUMED: Authorization already consumed.');
  }
  const ceilingUsd = options.costCeilingUsd;
  if (ceilingUsd === undefined || ceilingUsd === null) {
    throw new Error(
      'FATAL_V2_COST_CEILING_MISSING: Explicit operator cost ceiling required (costCeilingUsd). Environment fallback is disallowed.',
    );
  }
  const ceilingNum = Number(ceilingUsd);
  if (Number.isNaN(ceilingNum) || ceilingNum <= 0) {
    throw new Error('FATAL_V2_COST_CEILING_MISSING: Operator cost ceiling must be positive.');
  }
  if (ceilingNum > AUTHORIZED_OPERATOR_COST_CEILING_USD) {
    throw new Error(
      `FATAL_V2_COST_CEILING_EXCEEDS_AUTHORIZED: Ceiling ${ceilingNum} exceeds authorized ${AUTHORIZED_OPERATOR_COST_CEILING_USD}.`,
    );
  }
  if (options.acceptTypesafeEmpiricalPricing !== true) {
    throw new Error(
      'FATAL_LIVE_PREAUTH_BLOCKED: TypeSafe empirical pricing acceptance required for this run (acceptTypesafeEmpiricalPricing: true).',
    );
  }
  if (
    MAX_V2_TYPESAFE_REQUESTS !== 4 ||
    MAX_V2_OPENAI_REQUESTS !== 4 ||
    V2_TOTAL_MAX_PROVIDER_REQUESTS !== 8 ||
    V2_CONCURRENCY !== 1 ||
    V2_RETRIES !== 0
  ) {
    throw new Error('FATAL_V2_REQUEST_CAPS_MISMATCH: Frozen v2 request caps changed.');
  }
  if (
    options.customerData ||
    options.useHoldout ||
    options.useTwilio ||
    options.useStagingDb ||
    options.useProductionDb ||
    options.customerTraffic
  ) {
    throw new Error(
      'FATAL_V2_STUDY_SCOPE_VIOLATION: Synthetic-only study forbids customer/holdout/telephony/DB paths.',
    );
  }
  const datasetPath = options.datasetPath ?? resolve(process.cwd(), AUTHORIZED_V2_DATASET_PATH);
  const rawDataset = readFileSync(datasetPath, 'utf8');
  const datasetSha256 = createHash('sha256').update(rawDataset).digest('hex');
  if (datasetSha256 !== AUTHORIZED_V2_DATASET_SHA256) {
    throw new Error(
      `FATAL_V2_DATASET_MISMATCH: Expected ${AUTHORIZED_V2_DATASET_SHA256}, got ${datasetSha256}.`,
    );
  }
  const parsed = JSON.parse(rawDataset);
  if (!Array.isArray(parsed.cases) || parsed.cases.length !== EXPECTED_V2_CASE_COUNT) {
    throw new Error(`FATAL_V2_DATASET_MISMATCH: Expected ${EXPECTED_V2_CASE_COUNT} cases.`);
  }
  const computeOfflineFreeze = options.computeOfflineFreeze ?? computeMixedIntentV2Freeze;
  const offlineFreeze = computeOfflineFreeze();
  if (offlineFreeze.executableAggregateSha256 !== AUTHORIZED_V2_OFFLINE_FREEZE_SHA256) {
    throw new Error(
      `FATAL_V2_OFFLINE_FREEZE_MISMATCH: Expected ${AUTHORIZED_V2_OFFLINE_FREEZE_SHA256}, got ${offlineFreeze.executableAggregateSha256}.`,
    );
  }
  const computeLiveFreeze = options.computeLiveFreeze ?? computeAuthorizedV2LiveFreeze;
  const liveFreezeArgs = {
    manifest: options.manifest,
    manifestPath: options.manifestPath,
    readBytes: options.readBytes,
    repoRoot: options.repoRoot,
    ref: options.ref,
  };
  const liveFreeze = computeLiveFreeze(liveFreezeArgs);
  const liveFreezeRepeat = computeLiveFreeze(liveFreezeArgs);
  if (
    liveFreeze.executableAggregateSha256 !== liveFreezeRepeat.executableAggregateSha256 ||
    liveFreeze.runtimeFileCount !== EXPECTED_AUTHORIZED_V2_LIVE_MODULE_COUNT
  ) {
    throw new Error(
      'FATAL_V2_LIVE_FREEZE_MISMATCH: Authorized live executable surface is not reproducibly frozen.',
    );
  }
  const planningEstimateUsd = computeV2LivePlanningEstimateUsd();
  if (planningEstimateUsd > ceilingNum) {
    throw new Error(
      `FATAL_V2_COST_CEILING_EXCEEDS_AUTHORIZED: Planning estimate ${planningEstimateUsd} exceeds ceiling ${ceilingNum}.`,
    );
  }
  return {
    datasetPath,
    datasetSha256,
    cases: parsed.cases,
    offlineFreezeSha256: offlineFreeze.executableAggregateSha256,
    liveFreezeSha256: liveFreeze.executableAggregateSha256,
    liveFreezeModuleCount: liveFreeze.runtimeFileCount,
    planningEstimateUsd,
    ceilingUsd: ceilingNum,
    authorizationConsumed: false,
  };
}
