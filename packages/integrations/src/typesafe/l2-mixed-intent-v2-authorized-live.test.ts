import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesOperatingHoursCapability } from '../../../../apps/voice/src/operating-hours-capability-matcher.js';
import { resolveOperatingHoursInvolvement } from '../../../../apps/voice/src/operating-hours-involvement.js';
import { interpretFrozenTurnPolicy } from '../../../../apps/voice/src/frozen-policy-interpreter.js';
import { handleOperatingHoursTurn } from '../../../../apps/voice/src/operating-hours-turn-handler.js';
import {
  AUTHORIZED_OPERATOR_COST_CEILING_USD,
  AUTHORIZED_V2_STUDY_ID,
  validateAuthorizedLivePreconditions,
} from '../../../../scripts/benchmarks/voice/l2-mixed-intent-v2-authorized-preconditions.mjs';
import {
  MAX_V2_OPENAI_REQUESTS,
  MAX_V2_TYPESAFE_REQUESTS,
  V2_CONCURRENCY,
  V2_RETRIES,
  V2_TOTAL_MAX_PROVIDER_REQUESTS,
  checkV2Caps,
  createV2InitialState,
  executeMixedIntentV2Case,
} from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2.mjs';
import { runAuthorizedV2Study } from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2-live.mjs';

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

function validAuthorization() {
  return { studyId: AUTHORIZED_V2_STUDY_ID, granted: true, consumed: false };
}

const LIVE_MANIFEST_PATH = resolve(
  'scripts/benchmarks/voice/l2-mixed-intent-v2-live-executable-freeze-manifest.json',
);

function workingTreeLiveFreezeProviders() {
  return {
    manifest: JSON.parse(readFileSync(LIVE_MANIFEST_PATH, 'utf8')),
    readBytes: (modPath: string) => readFileSync(resolve(modPath)),
  };
}

function requireFirstEvidence(result: {
  cases: Array<{
    policyOutcome: string | null;
    criterionAV2Pass: boolean;
    openAiInvoked: boolean;
    jevEvaluated: boolean;
    technicalStatus: string;
  }>;
}) {
  const first = result.cases[0];
  if (first === undefined) {
    throw new Error('authorized study must produce at least one case evidence');
  }
  return first;
}

function baseLiveOptions(overrides: Record<string, unknown> = {}) {
  const jev = createMockTypeSafe(GENERATIVE_SCORES);
  const openAi = createMockOpenAi('success');
  return {
    options: {
      allowLiveExecution: true,
      authorization: validAuthorization(),
      costCeilingUsd: 0.5,
      acceptTypesafeEmpiricalPricing: true,
      dryRunWrite: true,
      logger: silentLogger,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
      ...workingTreeLiveFreezeProviders(),
      ...overrides,
    },
    jev,
    openAi,
  };
}

describe('L2 Mixed-Intent v2 Authorized Live Study (Slice 006BG)', () => {
  it('A. no live intent dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({ allowLiveExecution: false });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_LIVE_INTENT_DENIED');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('B. missing authorization dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({ authorization: undefined });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_LIVE_AUTHORIZATION_MISSING');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('C. consumed authorization dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({
      authorization: { studyId: AUTHORIZED_V2_STUDY_ID, granted: true, consumed: true },
    });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow(
      'FATAL_LIVE_AUTHORIZATION_CONSUMED',
    );
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('D. wrong study identity dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({
      authorization: { studyId: 'phase-6-l2-some-other-study', granted: true, consumed: false },
    });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_LIVE_STUDY_MISMATCH');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('E. dataset hash mismatch dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({
      datasetPath: resolve(
        'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
      ),
    });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_V2_DATASET_MISMATCH');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('F. offline freeze mismatch dispatches zero providers', { timeout: 15000 }, async () => {
    const { options, jev, openAi } = baseLiveOptions({
      computeOfflineFreeze: () => ({ executableAggregateSha256: '0'.repeat(64) }),
    });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_V2_OFFLINE_FREEZE_MISMATCH');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('G. live freeze mismatch dispatches zero providers', { timeout: 15000 }, async () => {
    const { options, jev, openAi } = baseLiveOptions({
      computeLiveFreeze: () => ({ executableAggregateSha256: '0'.repeat(64) }),
    });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_V2_LIVE_FREEZE_MISMATCH');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('H. missing cost ceiling dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({ costCeilingUsd: undefined });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_V2_COST_CEILING_MISSING');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('I. ceiling above authorized $0.50 dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({ costCeilingUsd: 0.51 });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow(
      'FATAL_V2_COST_CEILING_EXCEEDS_AUTHORIZED',
    );
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('J. missing pricing acceptance dispatches zero providers', async () => {
    const { options, jev, openAi } = baseLiveOptions({ acceptTypesafeEmpiricalPricing: false });
    await expect(runAuthorizedV2Study(options)).rejects.toThrow('FATAL_LIVE_PREAUTH_BLOCKED');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('K. TypeSafe 5th call is blocked before network', async () => {
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('success');
    const raw = JSON.parse(
      readFileSync(
        resolve('scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json'),
        'utf8',
      ),
    );
    const state = {
      ...createV2InitialState(),
      typeSafeRequestsAttempted: 4,
      totalProviderRequestsAttempted: 4,
    };
    const { evidence } = await executeMixedIntentV2Case({
      caseData: raw.cases[0],
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      state,
      logger: silentLogger,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
    });
    expect(evidence.errorCategory).toBe('MAX_V2_TYPESAFE_REQUESTS_EXCEEDED');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
    expect(checkV2Caps(state, 'TYPESAFE')).toBe('MAX_V2_TYPESAFE_REQUESTS_EXCEEDED');
  });

  it('L. OpenAI 5th call is blocked before network', async () => {
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('success');
    const capped = {
      ...createV2InitialState(),
      openAiRequestsAttempted: 4,
      totalProviderRequestsAttempted: 4,
    };
    expect(checkV2Caps(capped, 'OPENAI')).toBe('MAX_V2_OPENAI_REQUESTS_EXCEEDED');
    expect(jev.getTranscripts()).toHaveLength(0);
    expect(openAi.getTranscripts()).toHaveLength(0);
  });

  it('M. total 9th call is blocked before network', async () => {
    const capped = {
      ...createV2InitialState(),
      typeSafeRequestsAttempted: 4,
      openAiRequestsAttempted: 4,
      totalProviderRequestsAttempted: 8,
    };
    expect(checkV2Caps(capped, 'TYPESAFE')).toBe('MAX_V2_TOTAL_REQUESTS_EXCEEDED');
  });

  it('N. concurrency stays 1 and O. retries stay 0', () => {
    expect(V2_CONCURRENCY).toBe(1);
    expect(V2_RETRIES).toBe(0);
    expect(MAX_V2_TYPESAFE_REQUESTS).toBe(4);
    expect(MAX_V2_OPENAI_REQUESTS).toBe(4);
    expect(V2_TOTAL_MAX_PROVIDER_REQUESTS).toBe(8);
    expect(AUTHORIZED_OPERATOR_COST_CEILING_USD).toBe(0.5);
  });

  it(
    'P. TypeSafe model mismatch is a technical failure with stop',
    { timeout: 15000 },
    async () => {
      const { options } = baseLiveOptions({
        typeSafeAdapter: {
          evaluateTurn: async () => {
            throw new LocalModelMismatchError('jev-9.99.9');
          },
        },
      });
      const result = await runAuthorizedV2Study(options);
      expect(result.metadata.classification).toBe('MODEL_IDENTITY_MISMATCH');
      expect(result.aggregates.criterionAV2PassObserved).toBe(false);
    },
  );

  it(
    'Q. direct GENERATIVE_REQUIRED fake path is eligible for Criterion A',
    { timeout: 15000 },
    async () => {
      const { options } = baseLiveOptions();
      const result = await runAuthorizedV2Study(options);
      expect(requireFirstEvidence(result).criterionAV2Pass).toBe(true);
      expect(requireFirstEvidence(result).policyOutcome).toBe('GENERATIVE_REQUIRED');
      expect(result.aggregates.criterionAV2PassObserved).toBe(true);
    },
  );

  it('R. deterministic candidate fallback is NOT Criterion A', { timeout: 15000 }, async () => {
    const jev = createMockTypeSafe(DETERMINISTIC_SCORES);
    const openAi = createMockOpenAi('success');
    const { options } = baseLiveOptions({
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
    });
    const result = await runAuthorizedV2Study(options);
    expect(requireFirstEvidence(result).policyOutcome).toBe('DETERMINISTIC_CANDIDATE');
    expect(requireFirstEvidence(result).criterionAV2Pass).toBe(false);
    expect(result.aggregates.criterionAV2PassObserved).toBe(false);
  });

  it(
    'S. SECURITY path invokes zero OpenAI and is NOT Criterion A',
    { timeout: 15000 },
    async () => {
      const jev = createMockTypeSafe(SECURITY_SCORES);
      const openAi = createMockOpenAi('success');
      const { options } = baseLiveOptions({
        typeSafeAdapter: jev.adapter,
        openAiAdapter: openAi.adapter,
      });
      const result = await runAuthorizedV2Study(options);
      expect(requireFirstEvidence(result).policyOutcome).toBe('SECURITY_ESCALATE');
      expect(requireFirstEvidence(result).openAiInvoked).toBe(false);
      expect(requireFirstEvidence(result).criterionAV2Pass).toBe(false);
      expect(openAi.getTranscripts()).toHaveLength(0);
    },
  );

  it(
    'T. technical provider error is a truthful technical failure',
    { timeout: 15000 },
    async () => {
      const failingJev = {
        adapter: {
          evaluateTurn: async () => {
            const err = new Error('fake timeout');
            err.name = 'TimeoutError';
            throw err;
          },
        },
      };
      const { options } = baseLiveOptions({ typeSafeAdapter: failingJev.adapter });
      const result = await runAuthorizedV2Study(options);
      expect(requireFirstEvidence(result).jevEvaluated).toBe(false);
      expect(requireFirstEvidence(result).technicalStatus).toBe('TIMEOUT');
      expect(requireFirstEvidence(result).criterionAV2Pass).toBe(false);
    },
  );

  it('U. full utterance is preserved end to end', { timeout: 15000 }, async () => {
    const raw = JSON.parse(
      readFileSync(
        resolve('scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json'),
        'utf8',
      ),
    );
    const jev = createMockTypeSafe(GENERATIVE_SCORES);
    const openAi = createMockOpenAi('success');
    const { options } = baseLiveOptions({
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
    });
    await runAuthorizedV2Study(options);
    expect(jev.getTranscripts()).toEqual(
      raw.cases.map((c: { callerTranscript: string }) => c.callerTranscript),
    );
    expect(openAi.getTranscripts()).toEqual(
      raw.cases.map((c: { callerTranscript: string }) => c.callerTranscript),
    );
  });

  it(
    'V. artifact carries no transcript, raw scores or credentials',
    { timeout: 15000 },
    async () => {
      const { options } = baseLiveOptions();
      const result = await runAuthorizedV2Study(options);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('callerTranscript');
      expect(serialized).not.toContain('securityScore');
      expect(serialized).not.toContain('Bearer');
      expect(serialized).not.toContain('offline-dummy-key');
    },
  );

  it(
    'W. one authorized fake study completes with an exact bounded artifact',
    { timeout: 15000 },
    async () => {
      const { options } = baseLiveOptions();
      const result = await runAuthorizedV2Study(options);
      expect(result.metadata.classification).toBe('PASS_COMPLETE');
      expect(result.cases).toHaveLength(4);
      expect(result.metadata.datasetSha256).toBe(
        'ade86008b360b90754e2ac95a560d381e7adc655ecb20d09f2a28077faf9c690',
      );
      expect(result.metadata.offlineFreezeSha256).toBe(
        '6fdc0827dd4dff4dab49f2c8f5a4e82d3024614680ea23106531c8a954ef1f2e',
      );
      expect(result.metadata.authorizedLiveFreezeSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.metadata.authorizedLiveFreezeModuleCount).toBe(3);
      expect(result.metadata.authorizationScope).toBe('ONE_TARGETED_V2_SYNTHETIC_STUDY');
      expect(result.metadata.operatorCeilingUsd).toBe(0.5);
      expect(result.metadata.authorizationConsumed).toBe(false);
      expect(result.metadata.providerExecutionStatus).toBe('FAKE_OFFLINE_VALIDATION');
      expect(result.aggregates.typeSafeRequestsAttempted).toBe(4);
      expect(result.aggregates.openAiRequestsAttempted).toBe(4);
      expect(result.aggregates.totalProviderRequestsAttempted).toBe(8);
    },
  );

  it('X. fake validation never consumes the real authorization', async () => {
    const { options } = baseLiveOptions();
    const result = await runAuthorizedV2Study(options);
    expect(result.metadata.authorizationConsumed).toBe(false);
    expect(result.metadata.providerExecutionStatus).not.toBe('LIVE_DISPATCHED');
    expect(
      validateAuthorizedLivePreconditions({
        allowLiveExecution: true,
        authorization: validAuthorization(),
        costCeilingUsd: 0.5,
        acceptTypesafeEmpiricalPricing: true,
        ...workingTreeLiveFreezeProviders(),
      }).authorizationConsumed,
    ).toBe(false);
  }, 15000);

  it('Y. authorized live freeze is deterministic across invocations', async () => {
    const { computeAuthorizedV2LiveFreeze } =
      await import('../../../../scripts/benchmarks/voice/compute-l2-mixed-intent-v2-live-executable-freeze.mjs');
    const providers = workingTreeLiveFreezeProviders();
    const run1 = computeAuthorizedV2LiveFreeze({ ...providers });
    const run2 = computeAuthorizedV2LiveFreeze({ ...providers });
    expect(run1.executableAggregateSha256).toBe(run2.executableAggregateSha256);
    expect(run1.runtimeFileCount).toBe(3);
    expect(run1.executableAggregateSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
