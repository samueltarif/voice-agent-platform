import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeAtomicRequest } from './jev-calibration-case-executor.js';
import { ATOMIC_QUESTION_SET_SHA256 } from './jev-calibration-question-set.js';
import {
  applyFrozenPolicy,
  calculateHoldoutMetrics,
  calculateLatencyDistribution,
  determineHoldoutSafetyCriteria,
  filterHoldoutCases,
  serializeSanitizedHoldoutResults,
} from './jev-locked-holdout-calculator.js';
import type {
  HoldoutCaseResult,
  HoldoutExecutionArtifact,
  HoldoutRawCase,
  HoldoutSummary,
} from './jev-locked-holdout-types.js';
import {
  EXPECTED_HOLDOUT_CASE_COUNT,
  MAX_AUTHORIZED_HOLDOUT_JEV_COST_USD,
} from './jev-locked-holdout-types.js';
import {
  FROZEN_CANDIDATE_POLICY_DEFINITION,
  FROZEN_POLICY_SHA256,
} from './jev-candidate-policy-types.js';
import { TYPESAFE_INPUT_COST_PER_MILLION, TYPESAFE_MODEL } from './jev-routing-types.js';

export const EXPECTED_DATASET_SHA256 =
  '3e7e0a20ecd3341c99b84d40162b10eff17ba0600d191dd143bc99f00aec3047';

function validatePreconditions(apiKey?: string): { datasetBytes: Buffer; datasetSha: string } {
  if (!apiKey) throw new Error('STOP: TYPESAFE_API_KEY is not defined in environment');
  const datasetBytes = readFileSync(
    resolve('scripts/benchmarks/voice/jev-calibration-v2-cases.json'),
  );
  const datasetSha = createHash('sha256').update(datasetBytes).digest('hex');
  if (datasetSha !== EXPECTED_DATASET_SHA256) {
    throw new Error(`STOP: Dataset hash mismatch: ${datasetSha}`);
  }
  const worstCase =
    (EXPECTED_HOLDOUT_CASE_COUNT * 2000 * TYPESAFE_INPUT_COST_PER_MILLION) / 1_000_000;
  if (worstCase > MAX_AUTHORIZED_HOLDOUT_JEV_COST_USD) {
    throw new Error(`STOP: Cost ${worstCase} exceeds max ${MAX_AUTHORIZED_HOLDOUT_JEV_COST_USD}`);
  }
  return { datasetBytes, datasetSha };
}

export async function runLockedHoldoutEvaluation() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  const { datasetBytes, datasetSha } = validatePreconditions(apiKey);
  const rawDataset = JSON.parse(datasetBytes.toString('utf8')) as {
    version: string;
    cases: HoldoutRawCase[];
  };
  const holdoutCases = filterHoldoutCases(rawDataset.cases);

  console.log(
    `[Locked Holdout] Starting evaluation of ${holdoutCases.length} cases with frozen policy...`,
  );
  const results: HoldoutCaseResult[] = [];
  const latencies: number[] = [];
  let resolvedModel: string | null = null;
  let modelDrift = false;
  let execFailed = false;

  for (const c of holdoutCases) {
    const res = await executeAtomicRequest(c.syntheticCallerInput, apiKey!, TYPESAFE_MODEL);
    if (
      !res.success ||
      res.deterministicNoul === null ||
      res.generativeNoul === null ||
      res.securityNoul === null
    ) {
      execFailed = true;
      results.push({
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        atomic: null,
        frozenPolicyPrediction: null,
        classificationCorrect: null,
        status: 'FAIL',
        safeFailureCategory: res.error ?? 'ATOMIC_FAILURE',
      });
      break;
    }
    if (resolvedModel === null) resolvedModel = res.providerModel;
    else if (resolvedModel !== res.providerModel) {
      modelDrift = true;
      execFailed = true;
      results.push({
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        atomic: null,
        frozenPolicyPrediction: null,
        classificationCorrect: null,
        status: 'FAIL',
        safeFailureCategory: 'PARTIAL_MODEL_VERSION_DRIFT',
      });
      break;
    }
    latencies.push(res.latencyMs);
    const pred = applyFrozenPolicy({
      securityNoul: res.securityNoul,
      deterministicNoul: res.deterministicNoul,
      generativeNoul: res.generativeNoul,
    });
    results.push({
      caseId: c.caseId,
      expectedRoutingClass: c.expectedRoutingClass,
      atomic: {
        deterministicNoul: res.deterministicNoul,
        generativeNoul: res.generativeNoul,
        securityNoul: res.securityNoul,
        latencyMs: res.latencyMs,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        estimatedCostUsd: res.estimatedCostUsd,
        providerModel: res.providerModel ?? 'unknown',
      },
      frozenPolicyPrediction: pred,
      classificationCorrect: pred === c.expectedRoutingClass,
      status: 'PASS',
    });
  }

  for (let i = results.length; i < holdoutCases.length; i++) {
    results.push({
      caseId: holdoutCases[i].caseId,
      expectedRoutingClass: holdoutCases[i].expectedRoutingClass,
      atomic: null,
      frozenPolicyPrediction: null,
      classificationCorrect: null,
      status: 'NOT_EXECUTED',
    });
  }

  const isComplete =
    !execFailed &&
    results.length === EXPECTED_HOLDOUT_CASE_COUNT &&
    results.every((r) => r.status === 'PASS');
  const executedCases = results.filter((r) => r.status === 'PASS').length;
  const metrics = isComplete ? calculateHoldoutMetrics(results) : null;
  const safetyCriteria = metrics ? determineHoldoutSafetyCriteria(metrics) : 'NOT_MET_FALSE_BYPASS';
  const totalInput = results.reduce<number | null>(
    (acc, r) => (acc !== null && r.atomic?.inputTokens != null ? acc + r.atomic.inputTokens : null),
    0,
  );
  const totalOutput = results.reduce<number | null>(
    (acc, r) =>
      acc !== null && r.atomic?.outputTokens != null ? acc + r.atomic.outputTokens : null,
    0,
  );

  const summary: HoldoutSummary = {
    benchmarkStatus: isComplete ? 'COMPLETE' : 'PARTIAL',
    holdoutSafetyCriteria: safetyCriteria,
    syntheticLockedHoldoutResult: isComplete
      ? safetyCriteria === 'MET'
        ? 'CRITERIA_MET'
        : 'CRITERIA_NOT_MET'
      : 'PARTIAL_EXECUTION',
    requestedModel: TYPESAFE_MODEL,
    resolvedModelVersion: resolvedModel,
    modelVersionComparability: resolvedModel === 'jev-1.13.0' ? 'SAME' : 'CHANGED_FROM_CALIBRATION',
    modelVersionDrift: modelDrift,
    totalPlannedCases: EXPECTED_HOLDOUT_CASE_COUNT,
    executedCases,
    plannedRequests: EXPECTED_HOLDOUT_CASE_COUNT,
    executedRequests: executedCases,
    calibrationProviderRequests: 0,
    retries: 0,
    failures: execFailed ? 1 : 0,
    lockedHoldoutConsumed: executedCases > 0,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    usageBasedEstimatedCostUsd:
      totalInput !== null ? (totalInput * TYPESAFE_INPUT_COST_PER_MILLION) / 1_000_000 : null,
    latencyDistribution: isComplete ? calculateLatencyDistribution(latencies) : null,
    metrics,
  };

  const artifact: HoldoutExecutionArtifact = {
    metadata: {
      runTimestamp: new Date().toISOString(),
      datasetVersion: rawDataset.version,
      datasetSha256: datasetSha,
      atomicQuestionSetSha256: ATOMIC_QUESTION_SET_SHA256,
      frozenPolicySha256: FROZEN_POLICY_SHA256,
      frozenThresholds: {
        tSecurity: FROZEN_CANDIDATE_POLICY_DEFINITION.rules[0].condition.threshold,
        tDeterministic: FROZEN_CANDIDATE_POLICY_DEFINITION.rules[1].condition.all[0].threshold,
        tGenerative: FROZEN_CANDIDATE_POLICY_DEFINITION.rules[1].condition.all[1].threshold,
      },
    },
    summary,
    cases: serializeSanitizedHoldoutResults(results),
  };

  const outPath = resolve('docs/research/results/phase-6-jev-locked-holdout-v2-run1.json');
  writeFileSync(outPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`[Locked Holdout] Results saved to ${outPath}`);
  return artifact;
}

if (process.argv[1] && process.argv[1].endsWith('run-jev-locked-holdout.ts')) {
  runLockedHoldoutEvaluation().catch((err) => {
    console.error('[Locked Holdout Runner Error]', err);
    process.exit(1);
  });
}
