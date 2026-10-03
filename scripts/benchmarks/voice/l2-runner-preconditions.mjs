import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const EXPECTED_DATASET_SHA256 =
  'bd812341a922ded1c7159191849dae284a88f24afd9c7e8d3c64f9b081602f3f';
export const EXPECTED_CASE_COUNT = 12;
export const REQUESTED_TYPESAFE_MODEL = 'jev-1.13.0';
export const EXPECTED_TYPESAFE_MODEL = 'jev-1.13.0';
export const DEFAULT_OPENAI_MODEL = 'gpt-6-astra';

export const RESEARCH_HARNESS_TIMEOUT_MS = 5000;
export const TYPESAFE_PRICE_PER_BTOK = 42;
export const TYPESAFE_PRICE_STATUS = 'NOT_VERIFIED';
export const OPENAI_PRICE_STATUS = 'VERIFIED';
export const PROPOSED_COST_CEILING_USD = 0.25;
export const MAX_TYPESAFE_INPUT_TOKENS_PER_REQ = 1000;

export const TYPESAFE_HISTORICAL_PROJECTED_COST_USD = Number(
  (((7 * MAX_TYPESAFE_INPUT_TOKENS_PER_REQ) / 1_000_000_000) * TYPESAFE_PRICE_PER_BTOK).toFixed(6),
);
export const MAX_PROJECTED_TYPESAFE_COST_USD = TYPESAFE_HISTORICAL_PROJECTED_COST_USD;

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

export function parseCliArgs(customArgs) {
  const args = customArgs ?? process.argv.slice(2);
  const options = {
    allowLiveExecution: false,
    costCeilingUsd: undefined,
    datasetPath: undefined,
    outPath: undefined,
    dryRunWrite: false,
    offlineMode: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--allow-live') options.allowLiveExecution = true;
    else if (arg === '--offline') options.offlineMode = true;
    else if (arg === '--dry-run-write') options.dryRunWrite = true;
    else if (arg === '--cost-ceiling' && args[i + 1]) options.costCeilingUsd = Number(args[++i]);
    else if (arg === '--dataset' && args[i + 1]) options.datasetPath = args[++i];
    else if (arg === '--out' && args[i + 1]) options.outPath = args[++i];
  }
  return options;
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

function validateLivePreconditions(options) {
  if (!options.allowLiveExecution) {
    throw new Error(
      'FATAL_LIVE_INTENT_DENIED: Live execution not requested. Pass --allow-live to express live intent.',
    );
  }
  if (OPENAI_PRICE_STATUS !== 'VERIFIED') {
    throw new Error(
      'FATAL_LIVE_PREAUTH_BLOCKED: OpenAI price status is NOT_VERIFIED. Live execution is blocked until operator preauthorization.',
    );
  }
  if (TYPESAFE_PRICE_STATUS !== 'VERIFIED') {
    throw new Error(
      'FATAL_LIVE_PREAUTH_BLOCKED: TypeSafe price status is NOT_VERIFIED. Live execution is blocked until verified pricing is established.',
    );
  }
}

export function validatePreconditions(options, isOffline) {
  if (!isOffline) validateLivePreconditions(options);

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
