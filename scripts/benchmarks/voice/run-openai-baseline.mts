import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { ConversationModelInput } from '@voice-agent/contracts';
import { OpenAiConversationModelAdapter } from '../../../packages/integrations/src/openai/openai-conversation-model-adapter.js';
import type { OpenAiChatCompletionRequest } from '../../../packages/integrations/src/openai/openai-chat-completion-types.js';
import { calculateTurnCostUsd, computeBaselineSummary } from './baseline-metrics-calculator.js';
import {
  type BaselineCase,
  type BaselineCaseResult,
  type BaselineDataset,
  EXPECTED_CASE_COUNT,
  FROZEN_DATASET_SHA256,
  MAX_AUTHORIZED_BASELINE_COST_USD,
} from './baseline-types.js';

function loadAndVerifyDataset(filePath: string): BaselineDataset {
  const content = readFileSync(filePath, 'utf8');
  const actualHash = createHash('sha256').update(content).digest('hex');
  if (actualHash !== FROZEN_DATASET_SHA256) {
    throw new Error(
      `Dataset hash mismatch! Expected ${FROZEN_DATASET_SHA256}, got ${actualHash}. Dataset was modified.`,
    );
  }
  const dataset = JSON.parse(content) as BaselineDataset;
  if (!Array.isArray(dataset.cases) || dataset.cases.length !== EXPECTED_CASE_COUNT) {
    throw new Error(
      `Invalid case count: expected ${EXPECTED_CASE_COUNT}, got ${dataset.cases?.length}.`,
    );
  }
  return dataset;
}

function buildCaseInput(testCase: BaselineCase): ConversationModelInput {
  return {
    organizationId: 'org_baseline_bench',
    turnId: `turn_${testCase.caseId}`,
    generationId: `gen_${testCase.caseId}`,
    agentSnapshot: {
      persona: {
        role: 'Assistente Comercial',
        companyName: 'Lumina Tech',
        objective:
          'Responda de forma extremamente curta, concisa e profissional em português brasileiro para canal telefônico.',
        tone: 'OBJECTIVE',
        greetingPhrase: 'Olá, em que posso ajudar?',
        closingPhrase: 'Obrigado pelo contato.',
        fallbackPhrase: 'Poderia repetir por favor?',
      },
      voice: { languageCode: 'pt-BR' },
      rules: { conversational: ['Não inventar descontos'], deterministic: {} },
      playbook: { stages: [] },
      examples: [],
    },
    messages: [{ role: 'user', content: testCase.syntheticCallerInput }],
  };
}

async function runSingleCase(
  adapter: OpenAiConversationModelAdapter,
  testCase: BaselineCase,
): Promise<BaselineCaseResult> {
  const input = buildCaseInput(testCase);
  const t0 = performance.now();
  let ttftMs: number | null = null;
  let deltaCount = 0;
  let characterCount = 0;
  let accumulatedText = '';
  let terminalEvent = 'NONE';
  let usageInputTokens = 0;
  let usageOutputTokens = 0;
  let failureCategory: string | undefined;

  try {
    const stream = await adapter.streamTurn(input);
    for await (const ev of stream) {
      if (ev.type === 'text.delta') {
        if (ttftMs === null) {
          ttftMs = Math.round(performance.now() - t0);
        }
        deltaCount++;
        characterCount += ev.textDelta.length;
        accumulatedText += ev.textDelta;
      } else if (ev.type === 'usage') {
        usageInputTokens = ev.inputTokens;
        usageOutputTokens = ev.outputTokens;
      } else if (ev.type === 'completed') {
        terminalEvent = 'completed';
      } else if (ev.type === 'failure') {
        terminalEvent = 'failure';
        failureCategory = ev.error;
      }
    }

    const totalDurationMs = Math.round(performance.now() - t0);
    const pass = terminalEvent === 'completed' && deltaCount > 0 && accumulatedText.length > 0;
    const costUsd = calculateTurnCostUsd(usageInputTokens, usageOutputTokens);

    return {
      caseId: testCase.caseId,
      category: testCase.category,
      expectedRoutingClass: testCase.expectedRoutingClass,
      status: pass ? 'PASS' : 'FAIL',
      deltaCount,
      characterCount,
      ttftMs,
      totalDurationMs,
      inputTokens: usageInputTokens,
      outputTokens: usageOutputTokens,
      estimatedCostUsd: costUsd,
      terminalEvent,
      providerFailureCategory: failureCategory,
    };
  } catch (err) {
    const totalDurationMs = Math.round(performance.now() - t0);
    return {
      caseId: testCase.caseId,
      category: testCase.category,
      expectedRoutingClass: testCase.expectedRoutingClass,
      status: 'FAIL',
      deltaCount,
      characterCount,
      ttftMs,
      totalDurationMs,
      inputTokens: usageInputTokens,
      outputTokens: usageOutputTokens,
      estimatedCostUsd: 0,
      terminalEvent: 'exception',
      providerFailureCategory: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runOpenAiBaseline(datasetPath: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY_PRESENT=false -> STOP');
    process.exit(1);
  }

  const dataset = loadAndVerifyDataset(datasetPath);
  const worstCaseCost = EXPECTED_CASE_COUNT * calculateTurnCostUsd(150, 512);
  if (worstCaseCost > MAX_AUTHORIZED_BASELINE_COST_USD) {
    throw new Error(
      `Precondition failed: worst-case cost $${worstCaseCost.toFixed(4)} exceeds ceiling $${MAX_AUTHORIZED_BASELINE_COST_USD}. STOP.`,
    );
  }

  const guardedFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(init?.body as string) as OpenAiChatCompletionRequest;
    if (body.max_completion_tokens !== 512) {
      throw new Error(
        `Guard: max_completion_tokens is ${body.max_completion_tokens}, expected 512`,
      );
    }
    if (body.reasoning_effort !== 'low') {
      throw new Error(`Guard: reasoning_effort is ${body.reasoning_effort}, expected 'low'`);
    }
    if ('temperature' in body && body.temperature !== undefined) {
      throw new Error('Guard: temperature must be omitted');
    }
    return fetch(url, init);
  };

  const adapter = new OpenAiConversationModelAdapter({
    config: {
      modelId: 'gpt-6-astra',
      maxCompletionTokens: 512,
      reasoningEffort: 'low',
    },
    fetchFn: guardedFetch,
  });

  const results: BaselineCaseResult[] = [];
  console.log(`Starting baseline benchmark (${dataset.cases.length} cases)...`);

  for (const testCase of dataset.cases) {
    console.log(`[CASE ${testCase.caseId}] running category: ${testCase.category}...`);
    const result = await runSingleCase(adapter, testCase);
    results.push(result);

    console.log(
      `[CASE ${testCase.caseId}] status: ${result.status} | deltas: ${result.deltaCount} | chars: ${result.characterCount} | ttft: ${result.ttftMs}ms | dur: ${result.totalDurationMs}ms | in: ${result.inputTokens} | out: ${result.outputTokens} | cost: $${result.estimatedCostUsd.toFixed(6)}`,
    );

    if (result.status === 'FAIL') {
      console.error(
        `[FATAL] Case ${testCase.caseId} failed! Error: ${result.providerFailureCategory}`,
      );
      console.error('STOP: Halting benchmark execution immediately. Zero retries.');
      break;
    }
  }

  const summary = computeBaselineSummary(results, EXPECTED_CASE_COUNT);
  console.log('\n========================================');
  console.log('BASELINE BENCHMARK SUMMARY (N=12)');
  console.log('========================================');
  console.log(`Executed: ${summary.executedCases} / ${summary.totalCases}`);
  console.log(`Failed: ${summary.failedCases}`);
  console.log(`Total Tokens: in=${summary.totalInputTokens}, out=${summary.totalOutputTokens}`);
  console.log(`Total Cost: $${summary.totalCostUsd.toFixed(6)} USD`);
  console.log(`Average Cost/Turn: $${summary.averageCostPerTurnUsd.toFixed(6)} USD`);
  console.log(
    `TTFT (ms): min=${summary.minTtftMs}, median=${summary.medianTtftMs}, max=${summary.maxTtftMs}, p95=${summary.descriptiveP95TtftMs}`,
  );
  console.log(
    `Duration (ms): min=${summary.minDurationMs}, median=${summary.medianDurationMs}, max=${summary.maxDurationMs}, p95=${summary.descriptiveP95DurationMs}`,
  );
  console.log(
    `Main Model Call Avoidance Rate: ${summary.mainModelCallAvoidanceRate}% (Baseline reference)`,
  );
  console.log('========================================\n');
}

const defaultDatasetPath = resolve('scripts/benchmarks/voice/openai-baseline-v1-cases.json');
if (process.argv[1]?.includes('run-openai-baseline')) {
  runOpenAiBaseline(defaultDatasetPath).catch((err) => {
    console.error('Benchmark fatal error:', err);
    process.exit(1);
  });
}
