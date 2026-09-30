import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeSingleJevCase } from './jev-case-executor.js';
import { computeJevRoutingSummary } from './jev-routing-calculator.js';
import type { JevCaseResult, JevRoutingClass } from './jev-routing-types.js';
import {
  JEV_QUESTION_SHA256,
  JEV_ROUTING_QUESTION_VERSION,
  MAX_AUTHORIZED_JEV_COST_USD,
  MAX_REAL_JEV_CALLS,
  TYPESAFE_ENDPOINT,
} from './jev-routing-types.js';

interface RawCase {
  readonly caseId: string;
  readonly expectedRoutingClass: JevRoutingClass;
  readonly syntheticCallerInput: string;
}

interface RawDataset {
  readonly version: string;
  readonly cases: readonly RawCase[];
}

const FROZEN_DATASET_SHA256 = '9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50';

async function runBenchmark(): Promise<void> {
  const isKeyPresent = Boolean(process.env.TYPESAFE_API_KEY);
  console.log(`TYPESAFE_API_KEY_PRESENT=${isKeyPresent}`);
  if (!isKeyPresent) {
    console.error('ERROR: TYPESAFE_API_KEY is missing. Aborting.');
    process.exit(1);
  }

  const datasetPath = resolve('scripts/benchmarks/voice/openai-baseline-v1-cases.json');
  const rawContent = readFileSync(datasetPath, 'utf8');
  const datasetHash = createHash('sha256').update(rawContent).digest('hex');

  if (datasetHash !== FROZEN_DATASET_SHA256) {
    console.error('ERROR: Frozen dataset hash mismatch. Aborting.');
    process.exit(1);
  }

  const dataset = JSON.parse(rawContent) as RawDataset;
  if (dataset.cases.length !== MAX_REAL_JEV_CALLS) {
    console.error(`ERROR: Expected exactly ${MAX_REAL_JEV_CALLS} cases. Aborting.`);
    process.exit(1);
  }

  const conservativeUpperBoundUsd = 0.002;
  if (conservativeUpperBoundUsd > MAX_AUTHORIZED_JEV_COST_USD) {
    console.error('ERROR: Conservative upper bound exceeds budget. Aborting.');
    process.exit(1);
  }

  console.log(`Starting Jev routing benchmark: ${dataset.cases.length} cases, 0 retries...`);
  console.log(
    `Question Version: ${JEV_ROUTING_QUESTION_VERSION} (SHA-256: ${JEV_QUESTION_SHA256})`,
  );

  const results: JevCaseResult[] = [];
  const apiKey = process.env.TYPESAFE_API_KEY as string;

  for (const c of dataset.cases) {
    console.log(`Executing case: ${c.caseId}...`);
    const result = await executeSingleJevCase(c, apiKey);
    results.push(result);

    if (result.status === 'FAIL') {
      console.error(
        `Case ${c.caseId} failed (${result.safeFailureCategory}). Stopping further execution.`,
      );
      break;
    }
  }

  for (let i = results.length; i < dataset.cases.length; i++) {
    const unexecutedCase = dataset.cases[i]!;
    results.push({
      caseId: unexecutedCase.caseId,
      expectedRoutingClass: unexecutedCase.expectedRoutingClass,
      jevChoice: null,
      probabilities: null,
      confidence: null,
      jevLatencyMs: null,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      status: 'NOT_EXECUTED',
    });
  }

  const summary = computeJevRoutingSummary(results, dataset.cases.length);

  const outputArtifact = {
    benchmarkName: 'phase-6-jev-routing-benchmark-v1',
    executedAt: new Date().toISOString(),
    datasetHash: FROZEN_DATASET_SHA256,
    questionVersion: JEV_ROUTING_QUESTION_VERSION,
    questionHash: JEV_QUESTION_SHA256,
    model: 'jev-latest',
    endpoint: TYPESAFE_ENDPOINT,
    summary,
    cases: results,
  };

  const resultsDir = resolve('docs/research/results');
  mkdirSync(resultsDir, { recursive: true });
  const resultPath = resolve(resultsDir, 'phase-6-jev-routing-benchmark-v1.json');
  writeFileSync(resultPath, JSON.stringify(outputArtifact, null, 2), 'utf8');

  console.log(`\nBenchmark complete. Status: ${summary.benchmarkStatus}`);
  console.log(`Executed: ${summary.executedCases}/${summary.totalCases}`);
  console.log(
    `Routing Accuracy: ${summary.routingAccuracy !== null ? (summary.routingAccuracy * 100).toFixed(1) + '%' : 'N/A'}`,
  );
  console.log(`False Bypass Count: ${summary.falseBypassCount}`);
  console.log(`Security Miss Count: ${summary.securityMissCount}`);
  console.log(`Safe Avoided Calls: ${summary.safePotentialAvoidedCalls}/${summary.totalCases}`);
  console.log(`Artifact saved to: ${resultPath}`);
}

if (process.argv[1]?.includes('run-jev-routing-benchmark')) {
  runBenchmark().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Fatal execution error:', message);
    process.exit(1);
  });
}
