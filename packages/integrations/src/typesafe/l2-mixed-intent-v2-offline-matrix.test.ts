import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesOperatingHoursCapability } from '../../../../apps/voice/src/operating-hours-capability-matcher.js';
import { resolveOperatingHoursInvolvement } from '../../../../apps/voice/src/operating-hours-involvement.js';
import { interpretFrozenTurnPolicy } from '../../../../apps/voice/src/frozen-policy-interpreter.js';
import { handleOperatingHoursTurn } from '../../../../apps/voice/src/operating-hours-turn-handler.js';
import {
  MAX_V2_TYPESAFE_REQUESTS,
  MAX_V2_OPENAI_REQUESTS,
  V2_TOTAL_MAX_PROVIDER_REQUESTS,
  V2_CONCURRENCY,
  V2_RETRIES,
  checkV2Caps,
  createV2InitialState,
  executeMixedIntentV2Case,
  classifyV2RunResult,
  evaluateCriterionAV2,
  EXPECTED_V2_CASE_COUNT,
  EXPECTED_V2_DATASET_SHA256,
  computeV2Sha256,
  runMixedIntentV2Benchmark,
} from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2.mjs';

const datasetPath = resolve(
  'scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json',
);

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

class LocalModelMismatchError extends Error {
  observedModel: string | null;
  constructor(observed: string) {
    super(`Model identity mismatch: ${observed}`);
    this.name = 'TypeSafeModelIdentityMismatchError';
    this.observedModel = observed;
  }
}

const deps = {
  matchesOperatingHoursCapability,
  resolveOperatingHoursInvolvement,
  interpretFrozenTurnPolicy,
  handleOperatingHoursTurn,
  TypeSafeModelIdentityMismatchError: LocalModelMismatchError,
};

interface JevScores {
  security: number;
  deterministic: number;
  generative: number;
}

const GENERATIVE_SCORES: JevScores = { security: 0.01, deterministic: 0.1, generative: 0.9 };
const DETERMINISTIC_SCORES: JevScores = { security: 0.01, deterministic: 0.9, generative: 0.1 };
const SECURITY_SCORES: JevScores = { security: 0.9, deterministic: 0.1, generative: 0.1 };

interface V2LiteCase {
  id: string;
  description: string;
  callerTranscript: string;
  expectedMatcherMatched: boolean;
  expectedCapabilityRelevant: boolean;
  expectedExactlyAnswerable: boolean;
}

function loadV2Cases(): V2LiteCase[] {
  return JSON.parse(readFileSync(datasetPath, 'utf8')).cases as V2LiteCase[];
}

function requireFirstCase(): V2LiteCase {
  const [first] = loadV2Cases();
  if (first === undefined) {
    throw new Error('v2 dataset must contain at least one case');
  }
  return first;
}

function createMockTypeSafe(scores: JevScores) {
  const transcripts: string[] = [];
  return {
    getTranscripts: () => transcripts,
    adapter: {
      evaluateTurn: async (input: { callerTranscript: string }) => {
        transcripts.push(input.callerTranscript);
        return {
          securityScore: scores.security,
          deterministicScore: scores.deterministic,
          generativeScore: scores.generative,
          providerModel: 'jev-1.13.0',
          latencyMs: 2,
        };
      },
    },
  };
}

function createMockOpenAi(mode: 'success' | 'failure' = 'success') {
  const transcripts: string[] = [];
  return {
    getTranscripts: () => transcripts,
    adapter: {
      streamTurn: async (input: { messages: Array<{ role: string; content: string }> }) => {
        const user = input.messages.find((m) => m.role === 'user');
        transcripts.push(user?.content ?? '');
        if (mode === 'failure') {
          return (async function* () {
            yield { type: 'failure', error: 'OPENAI_FAKE_FAILURE' };
          })();
        }
        return (async function* () {})();
      },
    },
  };
}

describe('L2 Mixed-Intent v2 Offline Matrix (Slice 006BF)', () => {
  it('dataset hash and case count match versioned v2 constants', () => {
    const raw = readFileSync(datasetPath, 'utf8');
    expect(computeV2Sha256(raw)).toBe(EXPECTED_V2_DATASET_SHA256);
    expect(JSON.parse(raw).cases).toHaveLength(EXPECTED_V2_CASE_COUNT);
  });

  it('request caps derive from 4 cases: 4 Jev, 4 OpenAI, 8 total, concurrency 1, retries 0', () => {
    expect(MAX_V2_TYPESAFE_REQUESTS).toBe(4);
    expect(MAX_V2_OPENAI_REQUESTS).toBe(4);
    expect(V2_TOTAL_MAX_PROVIDER_REQUESTS).toBe(8);
    expect(V2_CONCURRENCY).toBe(1);
    expect(V2_RETRIES).toBe(0);
  });

  it('CASE A: GENERATIVE_REQUIRED dispatches fake OpenAI once and satisfies Criterion A v2', async () => {
    const first = requireFirstCase();
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('success');
    const state = createV2InitialState();
    const { evidence } = await executeMixedIntentV2Case({
      caseData: first,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      state,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.schemaVersion).toBe('2.0.0');
    expect(evidence.matcherMatched).toBe(false);
    expect(evidence.capabilityRelevant).toBe(true);
    expect(evidence.exactlyAnswerable).toBe(false);
    expect(evidence.jevEvaluated).toBe(true);
    expect(evidence.policyOutcome).toBe('GENERATIVE_REQUIRED');
    expect(evidence.openAiInvoked).toBe(true);
    expect(evidence.completionObserved).toBe(true);
    expect(evidence.securityEscalated).toBe(false);
    expect(evidence.criterionAV2Pass).toBe(true);
    expect(evaluateCriterionAV2(evidence)).toBe(true);
    expect(jev.getTranscripts()).toEqual([first.callerTranscript]);
    expect(openAi.getTranscripts()).toEqual([first.callerTranscript]);
  });

  it('CASE B: DETERMINISTIC_CANDIDATE declines deterministically, falls back to OpenAI, never passes Criterion A v2', async () => {
    const first = requireFirstCase();
    const jev = createMockTypeSafe(DETERMINISTIC_SCORES);
    const openAi = createMockOpenAi('success');
    const state = createV2InitialState();
    const { evidence } = await executeMixedIntentV2Case({
      caseData: first,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      state,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.policyOutcome).toBe('DETERMINISTIC_CANDIDATE');
    expect(evidence.deterministicDispatchAttempted).toBe(true);
    expect(evidence.deterministicHandled).toBe(false);
    expect(evidence.deterministicDeclineFallback).toBe(true);
    expect(evidence.openAiInvoked).toBe(true);
    expect(evidence.completionObserved).toBe(true);
    expect(evidence.criterionAV2Pass).toBe(false);
    expect(evaluateCriterionAV2(evidence)).toBe(false);
    expect(openAi.getTranscripts()).toEqual([first.callerTranscript]);
  });

  it('CASE C: SECURITY_ESCALATE invokes zero OpenAI and never passes Criterion A v2', async () => {
    const first = requireFirstCase();
    const jev = createMockTypeSafe(SECURITY_SCORES);
    const openAi = createMockOpenAi('success');
    const state = createV2InitialState();
    const { evidence } = await executeMixedIntentV2Case({
      caseData: first,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      state,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.policyOutcome).toBe('SECURITY_ESCALATE');
    expect(evidence.securityEscalated).toBe(true);
    expect(evidence.openAiInvoked).toBe(false);
    expect(evidence.completionObserved).toBe(false);
    expect(evidence.criterionAV2Pass).toBe(false);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('CASE D: Jev technical failure is classified truthfully with zero OpenAI', async () => {
    const first = requireFirstCase();
    const failingJev = {
      adapter: {
        evaluateTurn: async () => {
          const err = new Error('fake timeout');
          err.name = 'TimeoutError';
          throw err;
        },
      },
    };
    const openAi = createMockOpenAi('success');
    const state = createV2InitialState();
    const { evidence } = await executeMixedIntentV2Case({
      caseData: first,
      deps,
      typeSafeAdapter: failingJev.adapter,
      openAiAdapter: openAi.adapter,
      state,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.jevEvaluated).toBe(false);
    expect(evidence.technicalStatus).toBe('TIMEOUT');
    expect(evidence.openAiInvoked).toBe(false);
    expect(evidence.criterionAV2Pass).toBe(false);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('CASE E: OpenAI technical failure after GENERATIVE_REQUIRED is classified truthfully without Criterion A v2 pass', async () => {
    const first = requireFirstCase();
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('failure');
    const state = createV2InitialState();
    const { evidence } = await executeMixedIntentV2Case({
      caseData: first,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      state,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.policyOutcome).toBe('GENERATIVE_REQUIRED');
    expect(evidence.openAiInvoked).toBe(true);
    expect(evidence.completionObserved).toBe(false);
    expect(evidence.technicalStatus).toBe('PROVIDER_ERROR');
    expect(evidence.criterionAV2Pass).toBe(false);
  });

  it('CASE F: dataset expectation mismatch fails closed with zero provider requests', async () => {
    const first = requireFirstCase();
    const tampered = { ...first, expectedCapabilityRelevant: false };
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('success');
    const state = createV2InitialState();
    const { evidence } = await executeMixedIntentV2Case({
      caseData: tampered,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      state,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.technicalStatus).toBe('CONTRACT_MISMATCH');
    expect(evidence.jevEvaluated).toBe(false);
    expect(evidence.openAiInvoked).toBe(false);
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('CASE G: cap breach is blocked before any extra provider request', async () => {
    const first = requireFirstCase();
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('success');
    const capped = {
      ...createV2InitialState(),
      typeSafeRequestsAttempted: 4,
      totalProviderRequestsAttempted: 4,
    };
    const { evidence } = await executeMixedIntentV2Case({
      caseData: first,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      state: capped,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.errorCategory).toBe('MAX_V2_TYPESAFE_REQUESTS_EXCEEDED');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
    expect(checkV2Caps(capped, 'TYPESAFE')).toBe('MAX_V2_TYPESAFE_REQUESTS_EXCEEDED');
  });

  it('run-level: all-GENERATIVE_REQUIRED fakes produce PASS_COMPLETE; deterministic-only fakes produce NO_V2_GENERATIVE_REQUIRED_CASE_OBSERVED', async () => {
    const generativeRun = await runMixedIntentV2Benchmark({
      offlineMode: true,
      dryRunWrite: true,
      logger: silentLogger,
      deps,
      typeSafeAdapter: createMockTypeSafe(GENERATIVE_SCORES).adapter,
      openAiAdapter: createMockOpenAi('success').adapter,
    });
    expect(generativeRun.metadata.classification).toBe('PASS_COMPLETE');
    expect(generativeRun.aggregates.criterionAV2PassObserved).toBe(true);

    const deterministicRun = await runMixedIntentV2Benchmark({
      offlineMode: true,
      dryRunWrite: true,
      logger: silentLogger,
      deps,
      typeSafeAdapter: createMockTypeSafe(DETERMINISTIC_SCORES).adapter,
      openAiAdapter: createMockOpenAi('success').adapter,
    });
    expect(deterministicRun.metadata.classification).toBe(
      'NO_V2_GENERATIVE_REQUIRED_CASE_OBSERVED',
    );
    expect(deterministicRun.aggregates.criterionAV2PassObserved).toBe(false);
    expect(
      deterministicRun.cases.every((c: { openAiInvoked: boolean }) => c.openAiInvoked === true),
    ).toBe(true);
  });

  it('run-level classification never uses matched wording for v2 capability relevance', () => {
    expect(
      classifyV2RunResult({
        casesEvaluated: 4,
        totalExpected: 4,
        technicalFailures: 0,
        timeouts: 0,
        typeSafeMismatch: false,
        stoppedEarly: false,
        criterionPassObserved: false,
      }),
    ).toBe('NO_V2_GENERATIVE_REQUIRED_CASE_OBSERVED');
    expect(
      classifyV2RunResult({
        casesEvaluated: 4,
        totalExpected: 4,
        technicalFailures: 0,
        timeouts: 0,
        typeSafeMismatch: false,
        stoppedEarly: false,
        criterionPassObserved: true,
      }),
    ).toBe('PASS_COMPLETE');
    expect(
      classifyV2RunResult({
        casesEvaluated: 2,
        totalExpected: 4,
        technicalFailures: 1,
        timeouts: 0,
        typeSafeMismatch: false,
        stoppedEarly: true,
        criterionPassObserved: false,
      }),
    ).toBe('FAILED_TECHNICAL');
  });

  it('artifact carries no transcript, no raw scores and no credentials', async () => {
    const result = await runMixedIntentV2Benchmark({
      offlineMode: true,
      dryRunWrite: true,
      logger: silentLogger,
      deps,
      typeSafeAdapter: createMockTypeSafe(GENERATIVE_SCORES).adapter,
      openAiAdapter: createMockOpenAi('success').adapter,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Qual o horário de funcionamento');
    expect(serialized).not.toContain('callerTranscript');
    expect(serialized).not.toContain('syntheticCallerUtterance');
    expect(serialized).not.toContain('securityScore');
    expect(serialized).not.toContain('deterministicScore');
    expect(serialized).not.toContain('generativeScore');
    expect(serialized).not.toContain('offline-dummy-key');
    expect(serialized).not.toContain('Bearer');
  });

  it('live execution stays blocked without invoking any provider', async () => {
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('success');
    await expect(
      runMixedIntentV2Benchmark({
        offlineMode: false,
        allowLiveExecution: true,
        dryRunWrite: true,
        logger: silentLogger,
        deps,
        typeSafeAdapter: jev.adapter,
        openAiAdapter: openAi.adapter,
      }),
    ).rejects.toThrow('FATAL_LIVE_NOT_AUTHORIZED');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });
});
