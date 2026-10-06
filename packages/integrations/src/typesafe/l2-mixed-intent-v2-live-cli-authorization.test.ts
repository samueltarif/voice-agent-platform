import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesOperatingHoursCapability } from '../../../../apps/voice/src/operating-hours-capability-matcher.js';
import { resolveOperatingHoursInvolvement } from '../../../../apps/voice/src/operating-hours-involvement.js';
import { interpretFrozenTurnPolicy } from '../../../../apps/voice/src/frozen-policy-interpreter.js';
import { handleOperatingHoursTurn } from '../../../../apps/voice/src/operating-hours-turn-handler.js';
import { AUTHORIZED_V2_STUDY_ID } from '../../../../scripts/benchmarks/voice/l2-mixed-intent-v2-authorized-preconditions.mjs';
import {
  parseAuthorizedV2CliArgs,
  runAuthorizedV2Study,
} from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2-live.mjs';

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

const deps = {
  matchesOperatingHoursCapability,
  resolveOperatingHoursInvolvement,
  interpretFrozenTurnPolicy,
  handleOperatingHoursTurn,
  TypeSafeModelIdentityMismatchError: class extends Error {
    observedModel: string | null;
    constructor(observed: string) {
      super(`Model identity mismatch: ${observed}`);
      this.name = 'TypeSafeModelIdentityMismatchError';
      this.observedModel = observed;
    }
  },
};

function createFakeJev() {
  return {
    adapter: {
      evaluateTurn: async () => ({
        securityScore: 0.01,
        deterministicScore: 0.1,
        generativeScore: 0.9,
        providerModel: 'jev-1.13.0',
        latencyMs: 2,
      }),
    },
  };
}

function createFakeOpenAi() {
  return {
    adapter: {
      streamTurn: async () => (async function* () {})(),
    },
  };
}

function liveFreezeProviders() {
  const manifestPath = resolve(
    'scripts/benchmarks/voice/l2-mixed-intent-v2-live-executable-freeze-manifest.json',
  );
  return {
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    readBytes: (modPath: string) => readFileSync(resolve(modPath)),
  };
}

describe('006BH live CLI authorization plumbing regression', () => {
  it('H. CLI with explicit single-study flag propagates human authorization to validator', async () => {
    const cliOptions = parseAuthorizedV2CliArgs([
      '--allow-live',
      '--accept-typesafe-empirical-pricing',
      '--cost-ceiling',
      '0.50',
      '--authorize-one-targeted-v2-synthetic-study',
    ]);
    const jev = createFakeJev();
    const openAi = createFakeOpenAi();
    const result = await runAuthorizedV2Study({
      ...cliOptions,
      logger: silentLogger,
      deps,
      typeSafeAdapter: jev.adapter,
      openAiAdapter: openAi.adapter,
      dryRunWrite: true,
      timeoutMs: 1000,
      openAiModelId: 'gpt-6-astra',
      ...liveFreezeProviders(),
    });
    expect(result.metadata.authorizationScope).toBe('ONE_TARGETED_V2_SYNTHETIC_STUDY');
    expect(result.metadata.authorizationConsumed).toBe(false);
    expect(result.metadata.providerExecutionStatus).toBe('FAKE_OFFLINE_VALIDATION');
    expect(result.cases).toHaveLength(4);
  });

  it('A. CLI without explicit authorization flag stays fail-closed', async () => {
    const cliOptions = parseAuthorizedV2CliArgs([
      '--allow-live',
      '--accept-typesafe-empirical-pricing',
      '--cost-ceiling',
      '0.50',
    ]);
    const jev = createFakeJev();
    const openAi = createFakeOpenAi();
    await expect(
      runAuthorizedV2Study({
        ...cliOptions,
        logger: silentLogger,
        deps,
        typeSafeAdapter: jev.adapter,
        openAiAdapter: openAi.adapter,
        dryRunWrite: true,
        timeoutMs: 1000,
        openAiModelId: 'gpt-6-astra',
        ...liveFreezeProviders(),
      }),
    ).rejects.toThrow('FATAL_LIVE_AUTHORIZATION_MISSING');
  });

  it('C. parsed CLI authorization carries exact single-study identity', () => {
    const cliOptions = parseAuthorizedV2CliArgs([
      '--allow-live',
      '--accept-typesafe-empirical-pricing',
      '--cost-ceiling',
      '0.50',
      '--authorize-one-targeted-v2-synthetic-study',
    ]) as unknown as {
      authorization?: { studyId?: string; granted?: boolean; consumed?: boolean };
    };
    expect(cliOptions.authorization?.studyId).toBe(AUTHORIZED_V2_STUDY_ID);
    expect(cliOptions.authorization?.granted).toBe(true);
    expect(cliOptions.authorization?.consumed).toBe(false);
  });
});
