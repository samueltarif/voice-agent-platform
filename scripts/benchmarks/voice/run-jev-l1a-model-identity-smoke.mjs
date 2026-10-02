#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const EXPECTED_DATASET_SHA256 = '12828e990c1c2523c159630511aeb945b26a941c24ecaa38776b4a2769a3b0d0';
const EXPECTED_CASE_COUNT = 20;
const REQUESTED_MODEL = 'jev-1.13.0';
const EXPECTED_PROVIDER_MODEL = 'jev-1.13.0';
const PRICE_PER_BTOK = 42; // $42 / billion input tokens ($0.042 / million input tokens)
const MAX_PROVIDER_REQUESTS = 20;
const MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST = 1000;
const MAX_PROJECTED_INPUT_TOKENS = MAX_PROVIDER_REQUESTS * MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST; // 20,000
const MAX_PROJECTED_COST_USD = Number(
  ((MAX_PROJECTED_INPUT_TOKENS / 1_000_000_000) * PRICE_PER_BTOK).toFixed(6),
); // 0.00084 USD

function computeSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function calculatePercentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function parseCostCeiling() {
  const envVal = process.env.L1A_COST_CEILING_USD;
  const args = process.argv.slice(2);
  let rawVal = envVal;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cost-ceiling' && args[i + 1]) {
      rawVal = args[i + 1];
      break;
    }
  }

  if (!rawVal) {
    console.error(
      'FATAL: Cost ceiling not provided. Set L1A_COST_CEILING_USD or pass --cost-ceiling <number>.',
    );
    process.exit(1);
  }

  const num = Number(rawVal);
  if (Number.isNaN(num) || num <= 0) {
    console.error('FATAL: Approved cost ceiling must be a positive number.');
    process.exit(1);
  }

  return num;
}

function classifyError(err) {
  const safeName = err instanceof Error ? err.name : 'UnknownError';
  if (safeName === 'TypeSafeModelIdentityMismatchError') {
    return { status: 'MODEL_IDENTITY_MISMATCH', errorCategory: safeName };
  }
  if (safeName === 'AbortError' || safeName === 'TimeoutError') {
    return { status: 'TIMEOUT', errorCategory: safeName };
  }
  if (err instanceof TypeError) {
    return { status: 'INVALID_RESPONSE', errorCategory: safeName };
  }
  return { status: 'PROVIDER_ERROR', errorCategory: safeName };
}

async function main() {
  const approvedCostCeilingUsd = parseCostCeiling();

  if (MAX_PROJECTED_COST_USD > approvedCostCeilingUsd) {
    console.error(
      `FATAL: MAX_PROJECTED_COST_USD (${MAX_PROJECTED_COST_USD}) exceeds approved cost ceiling (${approvedCostCeilingUsd}).`,
    );
    process.exit(1);
  }

  const datasetPath = resolve(
    process.cwd(),
    'scripts/benchmarks/voice/jev-l1a-model-identity-smoke-v1-cases.json',
  );
  const outPath = resolve(
    process.cwd(),
    'docs/research/results/phase-6-typesafe-l1a-model-identity-smoke-run1.json',
  );

  const rawDataset = readFileSync(datasetPath, 'utf8');
  const computedHash = computeSha256(rawDataset);

  if (computedHash !== EXPECTED_DATASET_SHA256) {
    console.error(
      `FATAL: Dataset SHA-256 mismatch. Expected ${EXPECTED_DATASET_SHA256}, got ${computedHash}`,
    );
    process.exit(1);
  }

  const parsedDataset = JSON.parse(rawDataset);
  const cases = parsedDataset.cases ?? [];

  if (cases.length !== EXPECTED_CASE_COUNT) {
    console.error(`FATAL: Expected exactly ${EXPECTED_CASE_COUNT} cases, found ${cases.length}`);
    process.exit(1);
  }

  if (!process.env.TYPESAFE_API_KEY) {
    console.error('FATAL: TYPESAFE_API_KEY is not defined in environment');
    process.exit(1);
  }

  const adapterModuleUrl = new URL(
    '../../../packages/integrations/dist/packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.js',
    import.meta.url,
  );

  const { TypeSafeJevTurnDecisionAdapter, TypeSafeModelIdentityMismatchError } = await import(
    adapterModuleUrl
  );

  const adapter = new TypeSafeJevTurnDecisionAdapter({
    apiKey: process.env.TYPESAFE_API_KEY,
    model: REQUESTED_MODEL,
    expectedProviderModel: EXPECTED_PROVIDER_MODEL,
  });

  console.log(`[L1A Runner] Initialized TypeSafe L1A Smoke Runner`);
  console.log(`[L1A Runner] Dataset SHA-256: ${computedHash} (VERIFIED)`);
  console.log(`[L1A Runner] Requested Model: ${REQUESTED_MODEL}`);
  console.log(`[L1A Runner] Expected Provider Model: ${EXPECTED_PROVIDER_MODEL}`);
  console.log(`[L1A Runner] Total Cases: ${cases.length}`);
  console.log(`[L1A Runner] Concurrency: 1 | Retries: 0 | Max Requests: ${MAX_PROVIDER_REQUESTS}`);
  console.log(`[L1A Runner] Approved Cost Ceiling: $${approvedCostCeilingUsd} USD`);
  console.log(`[L1A Runner] Conservative Upper Bound: $${MAX_PROJECTED_COST_USD} USD`);

  let requestsAttempted = 0;
  const caseResults = [];
  const latencies = [];
  let modelMatchesCount = 0;
  let modelMismatchesCount = 0;
  let technicalErrorsCount = 0;

  for (let i = 0; i < cases.length; i++) {
    const projectedTokensNext = (requestsAttempted + 1) * MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST;
    const projectedCostNext = Number(
      ((projectedTokensNext / 1_000_000_000) * PRICE_PER_BTOK).toFixed(6),
    );

    if (requestsAttempted >= MAX_PROVIDER_REQUESTS) {
      console.warn(
        `[L1A Runner] Reached MAX_PROVIDER_REQUESTS ceiling (${MAX_PROVIDER_REQUESTS}). Halting further calls.`,
      );
      break;
    }

    if (projectedCostNext > approvedCostCeilingUsd) {
      console.warn(
        `[L1A Runner] Next request would exceed approved cost ceiling ($${approvedCostCeilingUsd}). Halting.`,
      );
      break;
    }

    const c = cases[i];
    requestsAttempted++;

    const startMs = Date.now();
    try {
      const output = await adapter.evaluateTurn({
        organizationId: '00000000-0000-0000-0000-000000000000',
        callId: 'l1a-synthetic-call',
        turnId: c.caseId,
        callerTranscript: c.syntheticCallerInput,
        language: 'pt-BR',
        channel: 'phone',
      });

      const elapsed = Math.max(0, Date.now() - startMs);
      latencies.push(output.latencyMs ?? elapsed);
      modelMatchesCount++;

      // NOTE: L1A_RESULT_NOT_FOR_TUNING = YES.
      // Deliberately omits routing scores (deterministicScore, generativeScore, securityScore).
      caseResults.push({
        caseId: c.caseId,
        category: c.category,
        status: 'SUCCESS_MATCH',
        providerModel: output.providerModel,
        identityMatch: true,
        latencyMs: output.latencyMs ?? elapsed,
      });

      console.log(
        `  [${i + 1}/${cases.length}] ${c.caseId}: SUCCESS_MATCH (${output.providerModel}) - ${output.latencyMs ?? elapsed}ms`,
      );
    } catch (err) {
      const elapsed = Math.max(0, Date.now() - startMs);
      latencies.push(elapsed);

      const classification = classifyError(err);
      if (err instanceof TypeSafeModelIdentityMismatchError) {
        modelMismatchesCount++;
        caseResults.push({
          caseId: c.caseId,
          category: c.category,
          status: classification.status,
          providerModel: err.observedModel,
          identityMatch: false,
          latencyMs: elapsed,
          errorCategory: classification.errorCategory,
        });
        console.warn(
          `  [${i + 1}/${cases.length}] ${c.caseId}: MODEL_IDENTITY_MISMATCH (observed: ${err.observedModel})`,
        );
      } else {
        technicalErrorsCount++;
        caseResults.push({
          caseId: c.caseId,
          category: c.category,
          status: classification.status,
          providerModel: 'UNKNOWN',
          identityMatch: false,
          latencyMs: elapsed,
          errorCategory: classification.errorCategory,
        });
        console.error(
          `  [${i + 1}/${cases.length}] ${c.caseId}: ${classification.status} (${classification.errorCategory})`,
        );
      }
    }
  }

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const medianLatency = calculatePercentile(sortedLatencies, 50);
  const p90Latency = calculatePercentile(sortedLatencies, 90);
  const p95Latency = calculatePercentile(sortedLatencies, 95);
  const maxLatency = sortedLatencies.length > 0 ? sortedLatencies[sortedLatencies.length - 1] : 0;

  const totalEstimatedUpperBoundInputTokens =
    requestsAttempted * MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST;
  const estimatedUpperBoundCostUsd = Number(
    ((totalEstimatedUpperBoundInputTokens / 1_000_000_000) * PRICE_PER_BTOK).toFixed(6),
  );

  const resultArtifact = {
    metadata: {
      suite: 'phase-6-typesafe-l1a-model-identity-smoke',
      version: '1.0.0',
      executedAt: new Date().toISOString(),
      requestedModel: REQUESTED_MODEL,
      expectedProviderModel: EXPECTED_PROVIDER_MODEL,
      datasetPath: 'scripts/benchmarks/voice/jev-l1a-model-identity-smoke-v1-cases.json',
      datasetSha256: computedHash,
      datasetCaseCount: cases.length,
      maxRequestsCeiling: MAX_PROVIDER_REQUESTS,
      approvedCostCeilingUsd,
      retries: 0,
      concurrency: 1,
      customerData: 0,
      openAiCalls: 0,
      twilioCalls: 0,
      pricePerBtok: PRICE_PER_BTOK,
      actualBilledCostUsd: 'NOT_VERIFIED',
    },
    aggregates: {
      requestsAttempted,
      requestsSucceeded: modelMatchesCount,
      modelMatches: modelMatchesCount,
      modelMismatches: modelMismatchesCount,
      technicalFailures: technicalErrorsCount,
      totalEstimatedUpperBoundInputTokens,
      estimatedUpperBoundCostUsd,
      latency: {
        medianMs: medianLatency,
        p90Ms: p90Latency,
        p95Ms: p95Latency,
        maxMs: maxLatency,
        classification: 'DESCRIPTIVE_ONLY',
      },
    },
    cases: caseResults,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  const serialized = JSON.stringify(resultArtifact, null, 2);
  writeFileSync(outPath, serialized + '\n', 'utf8');

  const resultSha = computeSha256(serialized + '\n');
  console.log(`[L1A Runner] Execution complete. Results written to: ${outPath}`);
  console.log(`[L1A Runner] Result Artifact SHA-256: ${resultSha}`);
  console.log(
    `[L1A Runner] Requests Attempted: ${requestsAttempted} | Succeeded: ${modelMatchesCount} | Mismatches: ${modelMismatchesCount} | Errors: ${technicalErrorsCount}`,
  );
  console.log(
    `[L1A Runner] Latency Descriptive: median=${medianLatency}ms, p90=${p90Latency}ms, max=${maxLatency}ms`,
  );
}

main().catch((err) => {
  const safeErrorName = err instanceof Error ? err.name : 'UnknownError';
  console.error(`[L1A Runner] Uncaught execution error category: ${safeErrorName}`);
  process.exit(1);
});
