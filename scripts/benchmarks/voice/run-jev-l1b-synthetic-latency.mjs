#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const EXPECTED_DATASET_SHA256 =
  '952da0c7a6a10447baa9e24a976543e06b7480eb9bdef98096242d5276188136';
export const EXPECTED_CASE_COUNT = 100;
export const REQUESTED_MODEL = 'jev-1.13.0';
export const EXPECTED_PROVIDER_MODEL = 'jev-1.13.0';
export const PRICE_PER_BTOK = 42; // $42 / billion input tokens ($0.000000042 / token)
export const MAX_PROVIDER_REQUESTS = 100;
export const CONCURRENCY = 1;
export const RETRIES = 0;
export const MEASUREMENT_ONLY_DEADLINE_MS = 4000;
export const MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST = 1000;
export const MAX_PROJECTED_INPUT_TOKENS =
  MAX_PROVIDER_REQUESTS * MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST; // 100,000
export const MAX_PROJECTED_COST_USD = Number(
  ((MAX_PROJECTED_INPUT_TOKENS / 1_000_000_000) * PRICE_PER_BTOK).toFixed(6),
); // 0.00420 USD

export function computeSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function calculatePercentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function parseCostCeiling(customArgs, customEnv) {
  const envVal = (customEnv ?? process.env).L1B_COST_CEILING_USD;
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
      'FATAL: Cost ceiling not provided. Set L1B_COST_CEILING_USD or pass --cost-ceiling <number>.',
    );
  }

  const num = Number(rawVal);
  if (Number.isNaN(num) || num <= 0) {
    throw new Error('FATAL: Approved cost ceiling must be a positive number.');
  }

  return num;
}

export function classifyError(err, isTimedOut) {
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

export async function runL1bBenchmark(options = {}) {
  const approvedCostCeilingUsd =
    options.costCeilingUsd !== undefined
      ? options.costCeilingUsd
      : parseCostCeiling(options.customArgs, options.customEnv);

  if (MAX_PROJECTED_COST_USD > approvedCostCeilingUsd) {
    throw new Error(
      `FATAL: MAX_PROJECTED_COST_USD (${MAX_PROJECTED_COST_USD}) exceeds approved cost ceiling (${approvedCostCeilingUsd}).`,
    );
  }

  const datasetPath =
    options.datasetPath ??
    resolve(process.cwd(), 'scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json');
  const outPath =
    options.outPath ??
    resolve(
      process.cwd(),
      'docs/research/results/phase-6-typesafe-l1b-synthetic-latency-run1.json',
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

  const apiKey = options.apiKey ?? (options.customEnv ?? process.env).TYPESAFE_API_KEY;
  if (!apiKey && !options.fetchFn) {
    throw new Error('FATAL: TYPESAFE_API_KEY is not defined in environment');
  }

  const adapterModuleUrl = new URL(
    '../../../packages/integrations/dist/packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.js',
    import.meta.url,
  );

  const { TypeSafeJevTurnDecisionAdapter, TypeSafeModelIdentityMismatchError } = await import(
    adapterModuleUrl
  );

  const adapter = new TypeSafeJevTurnDecisionAdapter({
    apiKey: apiKey || 'offline-dummy-key',
    model: REQUESTED_MODEL,
    expectedProviderModel: EXPECTED_PROVIDER_MODEL,
    fetchFn: options.fetchFn,
  });

  const logger = options.logger ?? console;
  logger.log(`[L1B Runner] Initialized TypeSafe L1B Synthetic Latency Runner (Run 1)`);
  logger.log(`[L1B Runner] Dataset SHA-256: ${computedHash} (VERIFIED)`);
  logger.log(`[L1B Runner] Requested Model: ${REQUESTED_MODEL}`);
  logger.log(`[L1B Runner] Expected Provider Model: ${EXPECTED_PROVIDER_MODEL}`);
  logger.log(`[L1B Runner] Total Cases: ${cases.length}`);
  logger.log(`[L1B Runner] Concurrency: ${CONCURRENCY} (SERIAL) | Retries: ${RETRIES}`);
  logger.log(`[L1B Runner] Measurement Deadline: ${MEASUREMENT_ONLY_DEADLINE_MS}ms`);
  logger.log(`[L1B Runner] Approved Cost Ceiling: $${approvedCostCeilingUsd} USD`);
  logger.log(`[L1B Runner] Max Projected Cost: $${MAX_PROJECTED_COST_USD} USD`);

  let requestsAttempted = 0;
  let requestsSucceeded = 0;
  let modelMatchesCount = 0;
  let modelMismatchesCount = 0;
  let technicalErrorsCount = 0;
  let timeoutsCount = 0;
  let consecutiveTechnicalFailures = 0;

  const caseResults = [];
  const latencies = [];
  const binLatencies = { SHORT: [], MEDIUM: [], LONG: [] };

  for (let i = 0; i < cases.length; i++) {
    if (requestsAttempted >= MAX_PROVIDER_REQUESTS) {
      logger.warn(
        `[L1B Runner] Reached hard cap MAX_PROVIDER_REQUESTS (${MAX_PROVIDER_REQUESTS}).`,
      );
      break;
    }

    const projectedTokensNext = (requestsAttempted + 1) * MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST;
    const projectedCostNext = Number(
      ((projectedTokensNext / 1_000_000_000) * PRICE_PER_BTOK).toFixed(6),
    );
    if (projectedCostNext > approvedCostCeilingUsd) {
      logger.warn(
        `[L1B Runner] Next request exceeds approved cost ceiling ($${approvedCostCeilingUsd}). Halting.`,
      );
      break;
    }

    const c = cases[i];
    requestsAttempted++;

    const controller = new AbortController();
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, options.deadlineMs ?? MEASUREMENT_ONLY_DEADLINE_MS);

    const startMs = Date.now();
    try {
      const output = await adapter.evaluateTurn(
        {
          callerTranscript: c.syntheticCallerUtterance,
          language: 'pt-BR',
          channel: 'phone',
        },
        controller.signal,
      );
      clearTimeout(timeoutId);

      const elapsed = Math.max(0, Date.now() - startMs);
      const measuredLatency = output.latencyMs ?? elapsed;
      latencies.push(measuredLatency);
      if (binLatencies[c.inputSizeCategory]) {
        binLatencies[c.inputSizeCategory].push(measuredLatency);
      }

      requestsSucceeded++;
      modelMatchesCount++;
      consecutiveTechnicalFailures = 0;

      caseResults.push({
        caseId: c.caseId,
        inputSizeCategory: c.inputSizeCategory,
        status: 'SUCCESS_MATCH',
        providerModel: output.providerModel,
        identityMatch: true,
        latencyMs: measuredLatency,
      });

      logger.log(
        `  [${i + 1}/${cases.length}] ${c.caseId} (${c.inputSizeCategory}): SUCCESS_MATCH - ${measuredLatency}ms`,
      );
    } catch (err) {
      clearTimeout(timeoutId);
      const elapsed = Math.max(0, Date.now() - startMs);
      latencies.push(elapsed);
      if (binLatencies[c.inputSizeCategory]) {
        binLatencies[c.inputSizeCategory].push(elapsed);
      }

      const classification = classifyError(err, isTimedOut);

      if (classification.status === 'TIMEOUT') {
        timeoutsCount++;
        consecutiveTechnicalFailures++;
      } else if (classification.status === 'MODEL_IDENTITY_MISMATCH') {
        modelMismatchesCount++;
        consecutiveTechnicalFailures = 0;
      } else {
        technicalErrorsCount++;
        consecutiveTechnicalFailures++;
      }

      const observedModel =
        err instanceof TypeSafeModelIdentityMismatchError ? err.observedModel : 'UNKNOWN';

      caseResults.push({
        caseId: c.caseId,
        inputSizeCategory: c.inputSizeCategory,
        status: classification.status,
        providerModel: observedModel,
        identityMatch: false,
        latencyMs: elapsed,
        errorCategory: classification.errorCategory,
      });

      logger.warn(
        `  [${i + 1}/${cases.length}] ${c.caseId} (${c.inputSizeCategory}): ${classification.status} (${classification.errorCategory}) - ${elapsed}ms`,
      );

      if (classification.status === 'HTTP_AUTH_ERROR') {
        logger.error(
          `[L1B Runner] STOP: HTTP authentication/authorization error. Aborting experiment.`,
        );
        break;
      }

      if (classification.status === 'MODEL_IDENTITY_MISMATCH') {
        logger.error(
          `[L1B Runner] STOP: Model identity mismatch detected (${observedModel}). Aborting experiment.`,
        );
        break;
      }

      if (consecutiveTechnicalFailures >= 3) {
        logger.error(
          `[L1B Runner] STOP: 3 consecutive technical failures / timeouts observed. Triggering RESEARCH_SAFETY_HEURISTIC stop.`,
        );
        break;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const minMs = latencies.length > 0 ? latencies[0] : 0;
  const maxMs = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const medianMs = calculatePercentile(latencies, 50);
  const p75Ms = calculatePercentile(latencies, 75);
  const p90Ms = calculatePercentile(latencies, 90);
  const p95Ms = calculatePercentile(latencies, 95);
  const p99EmpiricalMs = calculatePercentile(latencies, 99);

  function calcBinStats(arr) {
    if (!arr || arr.length === 0) return { count: 0, medianMs: 0, p90Ms: 0, maxMs: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      count: sorted.length,
      medianMs: calculatePercentile(sorted, 50),
      p90Ms: calculatePercentile(sorted, 90),
      maxMs: sorted[sorted.length - 1],
    };
  }

  const completionUnder1500Count = latencies.filter((l) => l < 1500).length;
  const completionUnder1500Rate =
    latencies.length > 0 ? Number((completionUnder1500Count / latencies.length).toFixed(4)) : 0;

  const resultArtifact = {
    metadata: {
      suite: 'phase-6-typesafe-l1b-synthetic-latency',
      version: '1.0.0',
      executedAt: new Date().toISOString(),
      requestedModel: REQUESTED_MODEL,
      expectedProviderModel: EXPECTED_PROVIDER_MODEL,
      datasetPath: 'scripts/benchmarks/voice/jev-l1b-synthetic-latency-v1-cases.json',
      datasetSha256: computedHash,
      datasetCaseCount: cases.length,
      maxProviderRequests: MAX_PROVIDER_REQUESTS,
      concurrency: CONCURRENCY,
      observationDeadlineMs: MEASUREMENT_ONLY_DEADLINE_MS,
      retries: RETRIES,
      customerData: 0,
      openAiCalls: 0,
      twilioCalls: 0,
      projectedCostCeilingUsd: approvedCostCeilingUsd,
      actualBilledCostUsd: 'NOT_VERIFIED',
      pricePerBtok: PRICE_PER_BTOK,
      latencyClassification: 'DESCRIPTIVE_ONLY',
      tailLatencyConfidence: 'NOT ESTABLISHED',
      productionTimeoutSelected: false,
      productionConcurrencySelected: false,
    },
    aggregates: {
      requestsAttempted,
      requestsSucceeded,
      modelMatches: modelMatchesCount,
      modelMismatches: modelMismatchesCount,
      technicalFailures: technicalErrorsCount,
      timeouts: timeoutsCount,
      totalEstimatedUpperBoundInputTokens:
        requestsAttempted * MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST,
      estimatedUpperBoundCostUsd: Number(
        (
          ((requestsAttempted * MAX_ESTIMATED_INPUT_TOKENS_PER_REQUEST) / 1_000_000_000) *
          PRICE_PER_BTOK
        ).toFixed(6),
      ),
      latency: {
        minMs,
        medianMs,
        p75Ms,
        p90Ms,
        p95Ms,
        p99EmpiricalMs,
        maxMs,
        classification: 'DESCRIPTIVE_ONLY',
        tailConfidence: 'NOT ESTABLISHED',
      },
      binBreakdown: {
        SHORT: calcBinStats(binLatencies.SHORT),
        MEDIUM: calcBinStats(binLatencies.MEDIUM),
        LONG: calcBinStats(binLatencies.LONG),
      },
      completionUnder1500msCount: completionUnder1500Count,
      completionUnder1500msRate: completionUnder1500Rate,
    },
    cases: caseResults,
  };

  if (!options.dryRunWrite) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(resultArtifact, null, 2) + '\n', 'utf8');
    logger.log(`[L1B Runner] Results written to: ${outPath}`);
  }

  return resultArtifact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runL1bBenchmark().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
