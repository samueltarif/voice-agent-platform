import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateAtomicSignalsByClass,
  calculateChoiceMetrics,
  calculateDistribution,
  filterCalibrationCases,
  type RawV2Dataset,
  serializeSanitizedResults,
} from './jev-calibration-calculator.js';
import { executeAtomicRequest, executeChoiceRequest } from './jev-calibration-case-executor.js';
import type {
  JevCalibrationCaseResult,
  JevCalibrationPhaseASummary,
} from './jev-calibration-types.js';
import {
  CALIBRATION_CASE_COUNT,
  PLANNED_ATOMIC_REQUESTS,
  PLANNED_CHOICE_REQUESTS,
  TOTAL_PLANNED_CALIBRATION_REQUESTS,
} from './jev-calibration-types.js';
import { TYPESAFE_MODEL } from './jev-routing-types.js';

async function runCalibrationPhaseA() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new Error('STOP: TYPESAFE_API_KEY is not defined in environment');
  }

  const datasetPath = resolve('scripts/benchmarks/voice/jev-calibration-v2-cases.json');
  const rawDataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as RawV2Dataset;
  const calibrationCases = filterCalibrationCases(rawDataset.cases);

  console.log(
    `[Phase A Calibration] Starting run with ${calibrationCases.length} cases (160 requests)...`,
  );

  const results: JevCalibrationCaseResult[] = [];
  let resolvedModel: string | null = null;
  let modelDriftDetected = false;
  let executionFailed = false;
  let failureCategory: string | undefined;

  let executedChoice = 0;
  let executedAtomic = 0;

  for (let i = 0; i < calibrationCases.length; i++) {
    const c = calibrationCases[i]!;
    console.log(`[${i + 1}/${calibrationCases.length}] Executing case ${c.caseId}...`);

    // 1. Choice Request
    const choiceRes = await executeChoiceRequest(c.syntheticCallerInput, apiKey, TYPESAFE_MODEL);
    executedChoice++;

    if (!choiceRes.success) {
      executionFailed = true;
      failureCategory = `CHOICE_FAILURE: ${choiceRes.error}`;
      results.push({
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        choice: null,
        atomic: null,
        status: 'FAIL',
        safeFailureCategory: failureCategory,
      });
      break;
    }

    if (resolvedModel === null) {
      resolvedModel = choiceRes.providerModel;
      console.log(`[Model Lock] Resolved model version locked to: ${resolvedModel}`);
    } else if (choiceRes.providerModel !== resolvedModel) {
      modelDriftDetected = true;
      executionFailed = true;
      failureCategory = `MODEL_DRIFT: Expected ${resolvedModel}, got ${choiceRes.providerModel}`;
      results.push({
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        choice: null,
        atomic: null,
        status: 'FAIL',
        safeFailureCategory: failureCategory,
      });
      break;
    }

    // 2. Atomic Request
    const atomicRes = await executeAtomicRequest(c.syntheticCallerInput, apiKey, TYPESAFE_MODEL);
    executedAtomic++;

    if (!atomicRes.success) {
      executionFailed = true;
      failureCategory = `ATOMIC_FAILURE: ${atomicRes.error}`;
      results.push({
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        choice: {
          predictedClass: choiceRes.predictedClass!,
          probabilities: choiceRes.probabilities!,
          confidence: choiceRes.confidence!,
          latencyMs: choiceRes.latencyMs,
          inputTokens: choiceRes.inputTokens,
          outputTokens: choiceRes.outputTokens,
          estimatedCostUsd: choiceRes.estimatedCostUsd,
          providerModel: choiceRes.providerModel!,
        },
        atomic: null,
        status: 'FAIL',
        safeFailureCategory: failureCategory,
      });
      break;
    }

    if (atomicRes.providerModel !== resolvedModel) {
      modelDriftDetected = true;
      executionFailed = true;
      failureCategory = `MODEL_DRIFT: Expected ${resolvedModel}, got ${atomicRes.providerModel}`;
      results.push({
        caseId: c.caseId,
        expectedRoutingClass: c.expectedRoutingClass,
        choice: {
          predictedClass: choiceRes.predictedClass!,
          probabilities: choiceRes.probabilities!,
          confidence: choiceRes.confidence!,
          latencyMs: choiceRes.latencyMs,
          inputTokens: choiceRes.inputTokens,
          outputTokens: choiceRes.outputTokens,
          estimatedCostUsd: choiceRes.estimatedCostUsd,
          providerModel: choiceRes.providerModel!,
        },
        atomic: null,
        status: 'FAIL',
        safeFailureCategory: failureCategory,
      });
      break;
    }

    results.push({
      caseId: c.caseId,
      expectedRoutingClass: c.expectedRoutingClass,
      choice: {
        predictedClass: choiceRes.predictedClass!,
        probabilities: choiceRes.probabilities!,
        confidence: choiceRes.confidence!,
        latencyMs: choiceRes.latencyMs,
        inputTokens: choiceRes.inputTokens,
        outputTokens: choiceRes.outputTokens,
        estimatedCostUsd: choiceRes.estimatedCostUsd,
        providerModel: choiceRes.providerModel!,
      },
      atomic: {
        deterministicNoul: atomicRes.deterministicNoul!,
        generativeNoul: atomicRes.generativeNoul!,
        securityNoul: atomicRes.securityNoul!,
        latencyMs: atomicRes.latencyMs,
        inputTokens: atomicRes.inputTokens,
        outputTokens: atomicRes.outputTokens,
        estimatedCostUsd: atomicRes.estimatedCostUsd,
        providerModel: atomicRes.providerModel!,
      },
      status: 'PASS',
    });
  }

  const benchmarkStatus =
    executionFailed || results.length < CALIBRATION_CASE_COUNT
      ? modelDriftDetected
        ? 'PARTIAL'
        : 'PARTIAL'
      : 'COMPLETE';

  const choiceMetrics = calculateChoiceMetrics(results);
  const choiceLatencies = results.filter((r) => r.choice !== null).map((r) => r.choice!.latencyMs);
  const atomicLatencies = results.filter((r) => r.atomic !== null).map((r) => r.atomic!.latencyMs);

  const choiceInTokens = results
    .filter((r) => r.choice !== null && r.choice.inputTokens !== null)
    .map((r) => r.choice!.inputTokens!);
  const choiceOutTokens = results
    .filter((r) => r.choice !== null && r.choice.outputTokens !== null)
    .map((r) => r.choice!.outputTokens!);
  const atomicInTokens = results
    .filter((r) => r.atomic !== null && r.atomic.inputTokens !== null)
    .map((r) => r.atomic!.inputTokens!);
  const atomicOutTokens = results
    .filter((r) => r.atomic !== null && r.atomic.outputTokens !== null)
    .map((r) => r.atomic!.outputTokens!);

  const allUsageObserved =
    choiceInTokens.length === results.length && atomicInTokens.length === results.length;

  const totalChoiceIn = choiceInTokens.reduce((a, b) => a + b, 0);
  const totalChoiceOut = choiceOutTokens.reduce((a, b) => a + b, 0);
  const totalAtomicIn = atomicInTokens.reduce((a, b) => a + b, 0);
  const totalAtomicOut = atomicOutTokens.reduce((a, b) => a + b, 0);

  const choiceCost = results
    .filter((r) => r.choice !== null && r.choice.estimatedCostUsd !== null)
    .reduce((sum, r) => sum + r.choice!.estimatedCostUsd!, 0);
  const atomicCost = results
    .filter((r) => r.atomic !== null && r.atomic.estimatedCostUsd !== null)
    .reduce((sum, r) => sum + r.atomic!.estimatedCostUsd!, 0);

  const summary: JevCalibrationPhaseASummary = {
    benchmarkStatus,
    requestedModel: TYPESAFE_MODEL,
    resolvedModelVersion: resolvedModel,
    modelVersionDrift: modelDriftDetected,
    totalPlannedCases: CALIBRATION_CASE_COUNT,
    executedCases: results.length,
    plannedChoiceRequests: PLANNED_CHOICE_REQUESTS,
    executedChoiceRequests: executedChoice,
    plannedAtomicRequests: PLANNED_ATOMIC_REQUESTS,
    executedAtomicRequests: executedAtomic,
    totalPlannedRequests: TOTAL_PLANNED_CALIBRATION_REQUESTS,
    totalExecutedRequests: executedChoice + executedAtomic,
    retries: 0,
    holdoutRequests: 0,
    choiceRoutingAccuracy: choiceMetrics.accuracy,
    choiceDeterministicPrecision: choiceMetrics.precision,
    choiceDeterministicRecall: choiceMetrics.recall,
    choiceFalseBypassCount: choiceMetrics.falseBypassCount,
    choiceFalseBypassRateOverNonDeterministic: choiceMetrics.falseBypassRateOverNonDet,
    choiceFalseBypassRateAmongPredictedBypasses: choiceMetrics.falseBypassRateAmongPredicted,
    choiceSecurityMissCount: choiceMetrics.securityMissCount,
    choiceSecurityMissRate: choiceMetrics.securityMissRate,
    choiceUnnecessarySecurityEscalationCount: choiceMetrics.unnecessarySecurityEscalationCount,
    atomicSignalsByClass:
      benchmarkStatus === 'COMPLETE'
        ? {
            DETERMINISTIC_CANDIDATE: calculateAtomicSignalsByClass(
              results,
              'DETERMINISTIC_CANDIDATE',
            ),
            GENERATIVE_REQUIRED: calculateAtomicSignalsByClass(results, 'GENERATIVE_REQUIRED'),
            SECURITY_ESCALATE: calculateAtomicSignalsByClass(results, 'SECURITY_ESCALATE'),
          }
        : null,
    choiceLatencyMs: calculateDistribution(choiceLatencies),
    atomicLatencyMs: calculateDistribution(atomicLatencies),
    totalChoiceInputTokens: allUsageObserved ? totalChoiceIn : null,
    totalChoiceOutputTokens: allUsageObserved ? totalChoiceOut : null,
    totalAtomicInputTokens: allUsageObserved ? totalAtomicIn : null,
    totalAtomicOutputTokens: allUsageObserved ? totalAtomicOut : null,
    totalInputTokens: allUsageObserved ? totalChoiceIn + totalAtomicIn : null,
    totalOutputTokens: allUsageObserved ? totalChoiceOut + totalAtomicOut : null,
    totalChoiceCostUsd: allUsageObserved ? choiceCost : null,
    totalAtomicCostUsd: allUsageObserved ? atomicCost : null,
    totalJevCostUsd: allUsageObserved ? choiceCost + atomicCost : null,
    costVerificationStatus: allUsageObserved ? 'VERIFIED' : 'USAGE_NOT_OBSERVED',
  };

  const outputPayload = serializeSanitizedResults(results, summary);
  const outPath = resolve('docs/research/results/phase-6-jev-calibration-v2-phase-a-run1.json');
  writeFileSync(outPath, JSON.stringify(outputPayload, null, 2), 'utf8');
  console.log(`[Phase A Calibration] Results written to: ${outPath}`);
  console.log(
    `[Summary] Status: ${benchmarkStatus}, Model: ${resolvedModel}, Requests: ${executedChoice + executedAtomic}`,
  );

  if (executionFailed) {
    console.error(`[EXECUTION_HALTED] Category: ${failureCategory}`);
    process.exitCode = 1;
  }
}

void runCalibrationPhaseA().catch((err: unknown) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
