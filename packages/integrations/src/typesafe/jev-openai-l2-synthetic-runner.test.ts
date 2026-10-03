import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { L2CaseResult } from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs';
import {
  checkCaps,
  computeSha256,
  evaluateTypeSafeJev,
  executeCli,
  executeOpenAiTurn,
  EXPECTED_CASE_COUNT,
  EXPECTED_DATASET_SHA256,
  EXPECTED_TYPESAFE_MODEL,
  HARD_L2_COST_BOUND_FEASIBLE,
  L2_PLANNING_TOTAL_PROVIDER_COST_USD,
  MAX_OPENAI_INPUT_CHARS_PER_REQ,
  MAX_OPENAI_REQUESTS,
  MAX_TYPESAFE_INPUT_CHARS_PER_REQ,
  MAX_TYPESAFE_REQUESTS,
  OPENAI_PRICE_STATUS,
  parseCliArgs,
  resolveCostCeiling,
  runL2Benchmark,
  TOTAL_MAX_PROVIDER_REQUESTS,
  TYPESAFE_EMPIRICAL_RATE_PER_BTOK,
  TYPESAFE_PRICING_EVIDENCE,
  TYPESAFE_PRICE_STATUS,
  validateOpenAiInputBudget,
  validateTypeSafeInputBudget,
  validateTypeSafePreauth,
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
          model: 'gpt-6-astra',
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

  // A. Dataset hash & exact case count
  it('Matrix A: verifies dataset SHA-256 and exact case count of 12', () => {
    const raw = readFileSync(datasetPath, 'utf8');
    const hash = computeSha256(raw);
    expect(hash).toBe(EXPECTED_DATASET_SHA256);

    const parsed = JSON.parse(raw);
    expect(parsed.cases).toHaveLength(EXPECTED_CASE_COUNT);
  });

  // B & C. Matcher results across the 12 cases
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
    expect(serialized).not.toContain('syntheticCallerUtterance');
    expect(serialized).not.toContain('callerTranscript');
    expect(serialized).not.toContain('Qual é o horário de atendimento?');
    expect(serialized).not.toContain('rawRequest');
    expect(serialized).not.toContain('rawResponse');
    expect(serialized).not.toContain('Resposta sintética simulada.');
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('offline-dummy-key');
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

    expect(result.metadata.classification).toBe('PROVIDER_FAILURE');
    expect(result.cases[0]?.errorCategory).toContain('OFFLINE_NETWORK_DENIED');
  });

  // Finding B: Live preauthorization guard & pricing status
  // TEST_CHANGE_REASON: ASSERTION_STRONGER. Validates verified OpenAI price evidence,
  // unverified TypeSafe price blocker, explicit --allow-live gate, and preauth failure before network.
  it('Finding B: verifies live mode execution is blocked until price verification and preauth', async () => {
    expect(OPENAI_PRICE_STATUS).toBe('VERIFIED');
    expect(TYPESAFE_PRICE_STATUS).toBe('NOT_VERIFIED');

    // Without --allow-live: fails with FATAL_LIVE_INTENT_DENIED
    await expect(
      runL2Benchmark({
        offlineMode: false,
        allowLiveExecution: false,
        dryRunWrite: true,
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      }),
    ).rejects.toThrow('FATAL_LIVE_INTENT_DENIED');

    // With --allow-live but no empirical acceptance: still blocked because TypeSafe pricing is NOT_VERIFIED
    await expect(
      runL2Benchmark({
        offlineMode: false,
        allowLiveExecution: true,
        costCeilingUsd: 0.5,
        dryRunWrite: true,
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      }),
    ).rejects.toThrow('FATAL_LIVE_PREAUTH_BLOCKED: TypeSafe price status is NOT_VERIFIED');
  });

  // Empirical Preauth Policy Scenarios
  it('Preauth Policy: verifies empirical TypeSafe pricing acceptance contract and fail-closed gates', async () => {
    expect(HARD_L2_COST_BOUND_FEASIBLE).toBe('BLOCKED');
    expect(TYPESAFE_PRICE_STATUS).toBe('NOT_VERIFIED');
    expect(TYPESAFE_PRICING_EVIDENCE).toBe('ACCOUNT_BILLING_EMPIRICALLY_VERIFIED');
    expect(TYPESAFE_EMPIRICAL_RATE_PER_BTOK).toBe(42);
    expect(L2_PLANNING_TOTAL_PROVIDER_COST_USD).toBe(0.480294);

    // Scenario 1: Verified official pricing path still passes without empirical flag
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'VERIFIED',
        acceptTypesafeEmpiricalPricing: false,
        approvedCostCeilingUsd: 0.5,
      });
    }).not.toThrow();

    // Scenario 2: NOT_VERIFIED + no empirical acknowledgment blocks
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        acceptTypesafeEmpiricalPricing: false,
        approvedCostCeilingUsd: 0.5,
      });
    }).toThrow('FATAL_LIVE_PREAUTH_BLOCKED: TypeSafe price status is NOT_VERIFIED');

    // Scenario 3: Empirical evidence + no acknowledgment blocks
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        acceptTypesafeEmpiricalPricing: false,
        approvedCostCeilingUsd: 0.5,
      });
    }).toThrow('FATAL_LIVE_PREAUTH_BLOCKED: TypeSafe price status is NOT_VERIFIED');

    // Scenario 4: Acknowledgment + wrong evidence classification blocks
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'UNVERIFIED_THIRD_PARTY_CLAIM',
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: 0.5,
      });
    }).toThrow(
      'FATAL_LIVE_PREAUTH_BLOCKED: Unsupported pricing evidence classification: UNVERIFIED_THIRD_PARTY_CLAIM.',
    );

    // Scenario 5: Empirical acknowledgment without explicit ceiling and with NO env ceiling blocks
    await expect(
      runL2Benchmark({
        offlineMode: false,
        allowLiveExecution: true,
        acceptTypesafeEmpiricalPricing: true,
        costCeilingUsd: undefined,
        customArgs: [],
        customEnv: {},
        dryRunWrite: true,
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      }),
    ).rejects.toThrow('Explicit per-run cost ceiling required for empirical TypeSafe pricing');

    // Scenario 6: Empirical acknowledgment without explicit ceiling but WITH L2_COST_CEILING_USD present blocks
    await expect(
      runL2Benchmark({
        offlineMode: false,
        allowLiveExecution: true,
        acceptTypesafeEmpiricalPricing: true,
        costCeilingUsd: undefined,
        customArgs: [],
        customEnv: { L2_COST_CEILING_USD: '0.96' },
        dryRunWrite: true,
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      }),
    ).rejects.toThrow('Explicit per-run cost ceiling required for empirical TypeSafe pricing');

    // Legacy official VERIFIED pricing path allows L2_COST_CEILING_USD fallback
    expect(
      resolveCostCeiling({
        acceptTypesafeEmpiricalPricing: false,
        customArgs: [],
        customEnv: { L2_COST_CEILING_USD: '0.96' },
      }),
    ).toBe(0.96);

    // Unit guard: validateTypeSafePreauth blocks undefined ceiling
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: undefined,
      });
    }).toThrow('FATAL: Approved cost ceiling must be a positive number.');

    // Scenario 6: Empirical evidence + acknowledgment + malformed ceiling blocks
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: Number('invalid'),
      });
    }).toThrow('FATAL: Approved cost ceiling must be a positive number.');

    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: -1,
      });
    }).toThrow('FATAL: Approved cost ceiling must be a positive number.');

    // Scenario 7: Empirical evidence + acknowledgment + insufficient ceiling blocks
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: 0.25,
      });
    }).toThrow(
      'FATAL_LIVE_PREAUTH_BLOCKED: Approved cost ceiling ($0.25) is below minimum planning cost ($0.480294).',
    );

    // Scenario 8: Valid empirical policy + valid ceiling passes preauth
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        empiricalRatePerBtok: 42,
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: 0.480294,
      });
    }).not.toThrow();

    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        empiricalRatePerBtok: 42,
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: 0.96,
      });
    }).not.toThrow();

    // Scenario 9: Missing --allow-live in live mode blocks even if empirical pricing accepted
    await expect(
      runL2Benchmark({
        offlineMode: false,
        allowLiveExecution: false,
        acceptTypesafeEmpiricalPricing: true,
        costCeilingUsd: 0.96,
        dryRunWrite: true,
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      }),
    ).rejects.toThrow('FATAL_LIVE_INTENT_DENIED');

    // Scenario 10: Empirical planning rate mismatch blocks
    expect(() => {
      validateTypeSafePreauth({
        priceStatus: 'NOT_VERIFIED',
        pricingEvidence: 'ACCOUNT_BILLING_EMPIRICALLY_VERIFIED',
        empiricalRatePerBtok: 10,
        acceptTypesafeEmpiricalPricing: true,
        approvedCostCeilingUsd: 0.96,
      });
    }).toThrow(
      'FATAL_LIVE_PREAUTH_BLOCKED: Empirical planning rate mismatch. Expected 42 USD/Btok, got 10.',
    );
  });

  // Issue A Regression: Empirical policy must reject L2_COST_CEILING_USD from environment and require explicit per-run ceiling
  it('Issue A Regression: rejects L2_COST_CEILING_USD from environment and requires explicit per-run ceiling for empirical policy', async () => {
    const fakeTypeSafe = createFakeTypeSafeFetch();
    const fakeOpenAi = createFakeOpenAiFetch();

    await expect(
      runL2Benchmark({
        offlineMode: false,
        allowLiveExecution: true,
        acceptTypesafeEmpiricalPricing: true,
        fakeTypeSafeFetch: fakeTypeSafe.fetchFn,
        fakeOpenAiFetch: fakeOpenAi.fetchFn,
        dryRunWrite: true,
        customEnv: { L2_COST_CEILING_USD: '0.96' },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      }),
    ).rejects.toThrow('Explicit per-run cost ceiling required for empirical TypeSafe pricing');

    expect(fakeTypeSafe.getCallCount()).toBe(0);
    expect(fakeOpenAi.getCallCount()).toBe(0);
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
      openAiModelId: 'gpt-6-astra',
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    expect(result.metadata.requestedOpenAiModel).toBe('gpt-6-astra');
    expect(result.metadata.openAiModelIdentityStatus).toBe('NOT_OBSERVABLE_VIA_CURRENT_SURFACE');

    const openAiCases = result.cases.filter((c: L2CaseResult) => c.openAiCalled);
    for (const c of openAiCases) {
      expect(c.openAiRequestedModel).toBe('gpt-6-astra');
      expect(c.openAiObservedModel).toBeNull();
    }
  });

  // Hardening G: CLI args parser fail-closed behavior
  it('Hardening G: verifies CLI args parser sets explicit live-intent flag and options', () => {
    const defaultParsed = parseCliArgs([]);
    expect(defaultParsed.allowLiveExecution).toBe(false);
    expect(defaultParsed.acceptTypesafeEmpiricalPricing).toBe(false);
    expect(defaultParsed.offlineMode).toBe(false);

    const liveParsed = parseCliArgs(['--allow-live', '--cost-ceiling', '0.25']);
    expect(liveParsed.allowLiveExecution).toBe(true);
    expect(liveParsed.acceptTypesafeEmpiricalPricing).toBe(false);
    expect(liveParsed.costCeilingUsd).toBe(0.25);

    const empiricalParsed = parseCliArgs([
      '--allow-live',
      '--accept-typesafe-empirical-pricing',
      '--cost-ceiling',
      '0.96',
    ]);
    expect(empiricalParsed.allowLiveExecution).toBe(true);
    expect(empiricalParsed.acceptTypesafeEmpiricalPricing).toBe(true);
    expect(empiricalParsed.costCeilingUsd).toBe(0.96);

    const offlineParsed = parseCliArgs(['--offline', '--dry-run-write']);
    expect(offlineParsed.offlineMode).toBe(true);
    expect(offlineParsed.dryRunWrite).toBe(true);
  });

  // Hardening H: TypeSafe 8th request cap boundary (isolated)
  it('Hardening H: verifies 8th TypeSafe request is blocked BEFORE adapter fetch', async () => {
    const fakeFetch = createFakeTypeSafeFetch();
    const mockAdapter = {
      evaluateTurn: async () => {
        return fakeFetch.fetchFn('https://api.typesafe.ai/v1/systemone');
      },
    };

    const state = {
      typeSafeRequestsAttempted: 7,
      typeSafeRequestsSucceeded: 7,
      openAiRequestsAttempted: 0,
      openAiRequestsSucceeded: 0,
      totalProviderRequestsAttempted: 7,
      technicalFailures: 0,
      timeouts: 0,
      consecutiveFailures: 0,
      typeSafeMismatch: false,
    };

    const caseData = { caseId: 'l2-cap-test', syntheticCallerUtterance: 'Horário de atendimento' };
    const res = await evaluateTypeSafeJev({
      typeSafeAdapter: mockAdapter,
      caseData,
      state,
      deps: { TypeSafeModelIdentityMismatchError: class extends Error {} },
      logger: { error: () => {} },
      timeoutMs: 1000,
    });

    expect(res.errorResult).not.toBeNull();
    expect(res.errorResult?.errorCategory).toBe('MAX_TYPESAFE_REQUESTS_EXCEEDED');
    expect(res.errorResult?.shouldStop).toBe(true);
    expect(fakeFetch.getCallCount()).toBe(0);
    expect(state.typeSafeRequestsAttempted).toBe(7);
  });

  // Hardening I: OpenAI 13th request cap boundary (isolated)
  it('Hardening I: verifies 13th OpenAI request is blocked BEFORE adapter fetch', async () => {
    const fakeFetch = createFakeOpenAiFetch();
    const mockAdapter = {
      streamTurn: async () => {
        return fakeFetch.fetchFn('https://api.openai.com/v1/chat/completions');
      },
    };

    const state = {
      typeSafeRequestsAttempted: 0,
      typeSafeRequestsSucceeded: 0,
      openAiRequestsAttempted: 12,
      openAiRequestsSucceeded: 12,
      totalProviderRequestsAttempted: 12,
      technicalFailures: 0,
      timeouts: 0,
      consecutiveFailures: 0,
      generativeCount: 0,
    };

    const caseData = {
      caseId: 'l2-cap-test',
      syntheticCallerUtterance: 'Qualquer dúvida genérica',
    };
    const res = await executeOpenAiTurn({
      openAiAdapter: mockAdapter,
      caseData,
      state,
      logger: { error: () => {} },
      timeoutMs: 1000,
    });

    expect(res.errorCategory).toBe('MAX_OPENAI_REQUESTS_EXCEEDED');
    expect(res.shouldStop).toBe(true);
    expect(fakeFetch.getCallCount()).toBe(0);
    expect(state.openAiRequestsAttempted).toBe(12);
  });

  // Hardening J: Total 20th provider request cap boundary (isolated)
  it('Hardening J: verifies 20th total request is blocked BEFORE adapter fetch', async () => {
    const state = {
      typeSafeRequestsAttempted: 7,
      openAiRequestsAttempted: 12,
      totalProviderRequestsAttempted: 19,
    };

    expect(checkCaps(state, 'TYPESAFE')).toBe('MAX_TOTAL_REQUESTS_EXCEEDED');
    expect(checkCaps(state, 'OPENAI')).toBe('MAX_TOTAL_REQUESTS_EXCEEDED');
  });

  // Hardening K: Input size budget validation before network
  it('Hardening K: enforces input size caps before network call', async () => {
    expect(() => {
      validateTypeSafeInputBudget('a'.repeat(MAX_TYPESAFE_INPUT_CHARS_PER_REQ + 1));
    }).toThrow('exceeds maximum allowed');

    expect(() => {
      validateTypeSafeInputBudget('Curto');
    }).not.toThrow();

    expect(() => {
      validateOpenAiInputBudget([
        { role: 'system', content: 'x'.repeat(2000) },
        { role: 'user', content: 'y'.repeat(MAX_OPENAI_INPUT_CHARS_PER_REQ) },
      ]);
    }).toThrow('exceeds maximum allowed');

    expect(() => {
      validateOpenAiInputBudget([{ role: 'user', content: 'Normal' }]);
    }).not.toThrow();
  });

  // Hardening L: Global network is strictly denied in offline mode
  it('Hardening L: verifies globalThis.fetch is NOT called in offline mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await runL2Benchmark({
      offlineMode: true,
      dryRunWrite: true,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(result.metadata.classification).toBe('PROVIDER_FAILURE');
  });

  // Hardening M: CLI executeCli fail-closed exit semantics
  it('Hardening M: verifies executeCli returns non-zero on non-pass or precondition blockers', async () => {
    const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };
    // Missing --allow-live in non-offline call
    const exitCodeNoLive = await executeCli(['--cost-ceiling', '0.25'], process.env, silentLogger);
    expect(exitCodeNoLive).toBe(1);

    // With --allow-live but unverified pricing and no empirical acceptance
    const exitCodeLiveBlocked = await executeCli(
      ['--allow-live', '--cost-ceiling', '0.25'],
      process.env,
      silentLogger,
    );
    expect(exitCodeLiveBlocked).toBe(1);

    // With --allow-live and --accept-typesafe-empirical-pricing but insufficient cost ceiling (< 0.480294)
    const exitCodeInsufficientCeiling = await executeCli(
      ['--allow-live', '--accept-typesafe-empirical-pricing', '--cost-ceiling', '0.25'],
      process.env,
      silentLogger,
    );
    expect(exitCodeInsufficientCeiling).toBe(1);
  });
});
