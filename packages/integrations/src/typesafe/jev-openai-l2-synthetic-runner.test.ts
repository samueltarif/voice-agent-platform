import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { L2CaseResult } from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs';
import {
  computeSha256,
  EXPECTED_CASE_COUNT,
  EXPECTED_DATASET_SHA256,
  EXPECTED_TYPESAFE_MODEL,
  MAX_OPENAI_REQUESTS,
  MAX_TYPESAFE_REQUESTS,
  OPENAI_PRICE_STATUS,
  runL2Benchmark,
  TOTAL_MAX_PROVIDER_REQUESTS,
} from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs';

interface ScoreSet {
  deterministic: number;
  generative: number;
  security: number;
}

interface RecordedCall {
  url: string;
  headers: Record<string, string> | undefined;
  body: unknown;
}

function createFakeTypeSafeFetch(scoresByCase: Record<string, ScoreSet> = {}) {
  let callCount = 0;
  const calls: RecordedCall[] = [];

  const fetchFn = async (url: string, init?: RequestInit) => {
    callCount++;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, headers: init?.headers as Record<string, string>, body });

    const transcript = (body as { state?: { callerInput?: string } }).state?.callerInput ?? '';
    const scores: ScoreSet = scoresByCase[transcript] ?? {
      deterministic: 0.9,
      generative: 0.1,
      security: 0.05,
    };

    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: EXPECTED_TYPESAFE_MODEL,
        answers: {
          is_deterministic_candidate: { noul: scores.deterministic },
          is_generative_required: { noul: scores.generative },
          is_security_escalation: { noul: scores.security },
        },
      }),
    };
  };

  return { fetchFn, getCallCount: () => callCount, getCalls: () => calls };
}

function createFakeOpenAiFetch() {
  let callCount = 0;
  const calls: RecordedCall[] = [];

  const fetchFn = async (url: string, init?: RequestInit) => {
    callCount++;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, headers: init?.headers as Record<string, string>, body });

    const stream = new ReadableStream({
      start(controller) {
        const textChunk = JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: 123456,
          model: 'gpt-4o-mini',
          choices: [
            { index: 0, delta: { content: 'Resposta sintética simulada.' }, finish_reason: null },
          ],
        });
        controller.enqueue(new TextEncoder().encode(`data: ${textChunk}\n\ndata: [DONE]\n\n`));
        controller.close();
      },
    });

    return {
      ok: true,
      status: 200,
      body: stream,
    };
  };

  return { fetchFn, getCallCount: () => callCount, getCalls: () => calls };
}

describe('L2 Synthetic Integration Runner - Offline Matrix Validation', () => {
  const datasetPath = resolve(
    'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
  );
  const rawDataset = readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(rawDataset);

  // A. Dataset hash / count
  it('Matrix A: verifies dataset SHA-256 and exact case count of 12', () => {
    expect(computeSha256(rawDataset)).toBe(EXPECTED_DATASET_SHA256);
    expect(dataset.cases).toHaveLength(EXPECTED_CASE_COUNT);
    expect(dataset.totalCases).toBe(12);
  });

  // B & C. Matcher true count = 7, false count = 5
  it('Matrix B & C: verifies matcher results count across the 12 cases', async () => {
    const fakeTypeSafe = createFakeTypeSafeFetch();
    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    expect(result.aggregates.matcherMatchedCount).toBe(7);
    expect(result.aggregates.matcherUnmatchedCount).toBe(5);
    expect(result.aggregates.matcherEvaluations).toBe(12);
  });

  // D. Matcher false -> TypeSafe 0
  it('Matrix D: verifies matcher false suppresses TypeSafe completely (TypeSafe = 0)', async () => {
    const fakeTypeSafe = createFakeTypeSafeFetch();
    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    const unmatchedCases = result.cases.filter((c: L2CaseResult) => !c.matcherMatched);
    expect(unmatchedCases).toHaveLength(5);
    expect(unmatchedCases.every((c: L2CaseResult) => c.jevCalled === false)).toBe(true);
    expect(unmatchedCases.every((c: L2CaseResult) => c.jevProviderModel === null)).toBe(true);
    expect(fakeTypeSafe.getCallCount()).toBe(7);
  });

  // E, F, G, H, I. Caps, retries, concurrency
  it('Matrix E, F, G, H, I: enforces hard caps (TypeSafe 7, OpenAI 12, Total 19), retries = 0, concurrency = 1', async () => {
    expect(MAX_TYPESAFE_REQUESTS).toBe(7);
    expect(MAX_OPENAI_REQUESTS).toBe(12);
    expect(TOTAL_MAX_PROVIDER_REQUESTS).toBe(19);

    const fakeTypeSafe = createFakeTypeSafeFetch();
    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    expect(result.aggregates.typeSafeRequestsAttempted).toBeLessThanOrEqual(MAX_TYPESAFE_REQUESTS);
    expect(result.aggregates.openAiRequestsAttempted).toBeLessThanOrEqual(MAX_OPENAI_REQUESTS);
    expect(result.aggregates.totalProviderRequestsAttempted).toBeLessThanOrEqual(
      TOTAL_MAX_PROVIDER_REQUESTS,
    );
    expect(result.metadata.concurrency).toBe(1);
    expect(result.metadata.retries).toBe(0);
  });

  // J, K, L, M, N, O. Frozen Policy routing branches & OpenAI call counts
  it('Matrix J, K, L, M, N, O: tests Frozen Policy classification and single-owner dispatches', async () => {
    const scoresByCase = {
      'Qual é o horário de atendimento?': { deterministic: 0.9, generative: 0.1, security: 0.01 },
      'Horário de funcionamento': { deterministic: 0.1, generative: 0.8, security: 0.01 },
      'Que horas abre?': { deterministic: 0.1, generative: 0.1, security: 0.9 },
    };

    const fakeTypeSafe = createFakeTypeSafeFetch(scoresByCase);
    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    const l2_01 = result.cases.find((c: L2CaseResult) => c.caseId === 'l2-01');
    expect(l2_01?.observedRoute).toBe('DETERMINISTIC_RESPONSE');
    expect(l2_01?.openAiCalled).toBe(false);

    const l2_04 = result.cases.find((c: L2CaseResult) => c.caseId === 'l2-04');
    expect(l2_04?.observedRoute).toBe('GENERATIVE');
    expect(l2_04?.openAiCalled).toBe(true);

    const l2_05 = result.cases.find((c: L2CaseResult) => c.caseId === 'l2-05');
    expect(l2_05?.observedRoute).toBe('SECURITY_BLOCKED');
    expect(l2_05?.openAiCalled).toBe(false);

    expect(result.aggregates.coreJointChainObserved).toBe(true);
    expect(result.metadata.classification).toBe('PASS_COMPLETE');
  });

  // P. Exactly one final owner per case
  it('Matrix P: verifies each case finishes with exactly one route owner', async () => {
    const fakeTypeSafe = createFakeTypeSafeFetch();
    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    const validOwners = new Set(['DETERMINISTIC_RESPONSE', 'GENERATIVE', 'SECURITY_BLOCKED']);
    for (const c of result.cases) {
      expect(validOwners.has(c.observedRoute)).toBe(true);
    }
  });

  // Q, R, S, T. Sanitization of result artifact
  it('Matrix Q, R, S, T: verifies no transcript, raw payload, API key, or raw scores in serialized result', async () => {
    const fakeTypeSafe = createFakeTypeSafeFetch();
    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    const serialized = JSON.stringify(result);

    // Q: no transcript
    expect(serialized).not.toContain('syntheticCallerUtterance');
    expect(serialized).not.toContain('callerTranscript');
    expect(serialized).not.toContain('Qual é o horário de atendimento?');

    // R: no raw request/response
    expect(serialized).not.toContain('rawRequest');
    expect(serialized).not.toContain('rawResponse');
    expect(serialized).not.toContain('Resposta sintética simulada.');

    // S: no API key/Auth headers
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('offline-dummy-key');

    // T: no raw routing scores in case results
    expect(serialized).not.toContain('deterministicScore');
    expect(serialized).not.toContain('generativeScore');
    expect(serialized).not.toContain('securityScore');
  });

  // Finding A: Offline deny-network isolation
  it('Finding A: verifies offlineMode uses deny-network fetch preventing global network access', async () => {
    const result = await runL2Benchmark({
      offlineMode: true,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    // In offline mode with no fakes, deny-network fetch is called and rejects safely
    expect(result.metadata.classification).toBe('PROVIDER_FAILURE');
    expect(result.cases[0]?.errorCategory).toContain('OFFLINE_NETWORK_DENIED');
  });

  // Finding B: Live preauthorization guard
  it('Finding B: verifies live mode execution is blocked until price verification and preauth', async () => {
    expect(OPENAI_PRICE_STATUS).toBe('NOT_VERIFIED');

    await expect(
      runL2Benchmark({
        offlineMode: false,
        dryRunWrite: true,
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      }),
    ).rejects.toThrow('FATAL_LIVE_PREAUTH_BLOCKED');
  });

  // Finding C & D: Model Identity mismatch sets accurate counter and non-pass classification
  it('Finding C & D: verifies TypeSafe model identity mismatch stops early, derives accurate counters and status', async () => {
    const mismatchFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'unexpected-model-2.0',
        answers: {
          is_deterministic_candidate: { noul: 0.9 },
          is_generative_required: { noul: 0.1 },
          is_security_escalation: { noul: 0.05 },
        },
      }),
    });

    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: mismatchFetch,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    expect(result.cases).toHaveLength(1);
    expect(result.aggregates.matcherEvaluations).toBe(1);
    expect(result.metadata.classification).toBe('MODEL_IDENTITY_MISMATCH');
    expect(result.cases[0]?.technicalStatus).toBe('MODEL_IDENTITY_MISMATCH');
    expect(result.cases[0]?.jevProviderModel).toBe('unexpected-model-2.0');
  });

  // Finding E: Timeout handling
  it('Finding E: verifies timeout is classified as TIMEOUT and increments timeouts counter', async () => {
    const timeoutFetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: timeoutFetch,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    expect(result.aggregates.timeouts).toBeGreaterThan(0);
    expect(result.metadata.classification).toBe('PROVIDER_FAILURE');
  });

  // Finding F: OpenAI model requested vs unobservable model
  it('Finding F: verifies requested OpenAI model is separated from observed model', async () => {
    const fakeTypeSafe = createFakeTypeSafeFetch();
    const fakeOpenAi = createFakeOpenAiFetch();

    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
      fakeOpenAiFetch: fakeOpenAi.fetchFn,
      dryRunWrite: true,
      openAiModelId: 'gpt-4o-mini',
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    expect(result.metadata.requestedOpenAiModel).toBe('gpt-4o-mini');
    expect(result.metadata.openAiModelIdentityStatus).toBe('NOT_OBSERVABLE_VIA_CURRENT_SURFACE');

    const openAiCases = result.cases.filter((c: L2CaseResult) => c.openAiCalled);
    for (const c of openAiCases) {
      expect(c.openAiRequestedModel).toBe('gpt-4o-mini');
      expect(c.openAiObservedModel).toBeNull();
    }
  });
});
