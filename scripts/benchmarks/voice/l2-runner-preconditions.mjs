import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export * from './l2-runner-cost-ceiling.mjs';

import {
  L2_PLANNING_TOTAL_PROVIDER_COST_USD,
  resolveCostCeiling,
} from './l2-runner-cost-ceiling.mjs';

export const EXPECTED_DATASET_SHA256 =
  'bd812341a922ded1c7159191849dae284a88f24afd9c7e8d3c64f9b081602f3f';
export const EXPECTED_CASE_COUNT = 12;
export const REQUESTED_TYPESAFE_MODEL = 'jev-1.13.0';
export const EXPECTED_TYPESAFE_MODEL = 'jev-1.13.0';
export const DEFAULT_OPENAI_MODEL = 'gpt-6-astra';

export const RESEARCH_HARNESS_TIMEOUT_MS = 5000;
export const TYPESAFE_EMPIRICAL_RATE_PER_BTOK = 42;
export const TYPESAFE_PRICE_STATUS = 'NOT_VERIFIED';
export const TYPESAFE_PRICING_EVIDENCE = 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED';
export const OPENAI_PRICE_STATUS = 'VERIFIED';

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
    acceptTypesafeEmpiricalPricing: false,
    costCeilingUsd: undefined,
    datasetPath: undefined,
    outPath: undefined,
    dryRunWrite: false,
    offlineMode: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--allow-live') options.allowLiveExecution = true;
    else if (arg === '--accept-typesafe-empirical-pricing')
      options.acceptTypesafeEmpiricalPricing = true;
    else if (arg === '--offline') options.offlineMode = true;
    else if (arg === '--dry-run-write') options.dryRunWrite = true;
    else if (arg === '--cost-ceiling' && args[i + 1]) options.costCeilingUsd = Number(args[++i]);
    else if (arg === '--dataset' && args[i + 1]) options.datasetPath = args[++i];
    else if (arg === '--out' && args[i + 1]) options.outPath = args[++i];
  }
  return options;
}

export function validateTypeSafePreauth({
  acceptTypesafeEmpiricalPricing = false,
  priceStatus = TYPESAFE_PRICE_STATUS,
  pricingEvidence = TYPESAFE_PRICING_EVIDENCE,
  empiricalRatePerBtok = TYPESAFE_EMPIRICAL_RATE_PER_BTOK,
  approvedCostCeilingUsd,
} = {}) {
  if (priceStatus === 'VERIFIED') return;
  if (!acceptTypesafeEmpiricalPricing) {
    throw new Error(
      'FATAL_LIVE_PREAUTH_BLOCKED: TypeSafe price status is NOT_VERIFIED. Live execution is blocked until verified pricing is established or explicit empirical pricing acceptance is provided via --accept-typesafe-empirical-pricing.',
    );
  }
  if (pricingEvidence !== 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED') {
    throw new Error(
      `FATAL_LIVE_PREAUTH_BLOCKED: Unsupported pricing evidence classification: ${pricingEvidence}.`,
    );
  }
  if (empiricalRatePerBtok !== 42) {
    throw new Error(
      `FATAL_LIVE_PREAUTH_BLOCKED: Empirical planning rate mismatch. Expected 42 USD/Btok, got ${empiricalRatePerBtok}.`,
    );
  }
  if (
    approvedCostCeilingUsd === undefined ||
    Number.isNaN(Number(approvedCostCeilingUsd)) ||
    Number(approvedCostCeilingUsd) <= 0
  ) {
    throw new Error('FATAL: Approved cost ceiling must be a positive number.');
  }
  if (approvedCostCeilingUsd < L2_PLANNING_TOTAL_PROVIDER_COST_USD) {
    throw new Error(
      `FATAL_LIVE_PREAUTH_BLOCKED: Approved cost ceiling ($${approvedCostCeilingUsd}) is below minimum planning cost ($${L2_PLANNING_TOTAL_PROVIDER_COST_USD}).`,
    );
  }
}

function validateLivePreconditions(options, approvedCostCeilingUsd) {
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
  validateTypeSafePreauth({
    acceptTypesafeEmpiricalPricing: options.acceptTypesafeEmpiricalPricing,
    priceStatus: options.typeSafePriceStatus ?? TYPESAFE_PRICE_STATUS,
    pricingEvidence: options.typeSafePricingEvidence ?? TYPESAFE_PRICING_EVIDENCE,
    empiricalRatePerBtok: options.typeSafeEmpiricalRatePerBtok ?? TYPESAFE_EMPIRICAL_RATE_PER_BTOK,
    approvedCostCeilingUsd,
  });
}

export function validatePreconditions(options, isOffline) {
  let approvedCostCeilingUsd = 0;
  if (!isOffline) {
    if (!options.allowLiveExecution) {
      throw new Error(
        'FATAL_LIVE_INTENT_DENIED: Live execution not requested. Pass --allow-live to express live intent.',
      );
    }
    const rawCeiling = resolveCostCeiling(options);
    const numCeiling = Number(rawCeiling);
    if (Number.isNaN(numCeiling) || numCeiling <= 0) {
      throw new Error('FATAL: Approved cost ceiling must be a positive number.');
    }
    approvedCostCeilingUsd = numCeiling;
    validateLivePreconditions(options, approvedCostCeilingUsd);
  }

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
