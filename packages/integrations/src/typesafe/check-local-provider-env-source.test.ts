import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkLocalProviderEnvSource,
  parsePreflightCliArgs,
} from '../../../../scripts/benchmarks/voice/check-local-provider-env-source.mjs';

const tempFixtureDir = resolve('packages/integrations/src/typesafe');

function withTempSyntheticEnv(content: string, testFn: (filePath: string) => Promise<void>) {
  const filePath = resolve(
    tempFixtureDir,
    `temp-synthetic-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.env`,
  );
  writeFileSync(filePath, content, 'utf8');
  return testFn(filePath).finally(() => {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  });
}

describe('006BN no-network local provider env preflight', () => {
  it('A. env file missing => fails closed with readiness NO', async () => {
    const nonExistentPath = resolve(tempFixtureDir, 'non-existent-synthetic-probe.env');
    const result = await checkLocalProviderEnvSource({ envFilePath: nonExistentPath });
    expect(result.envFileExists).toBe(false);
    expect(result.typeSafeCredentialPresent).toBe(false);
    expect(result.openAiCredentialPresent).toBe(false);
    expect(result.sanitizedChildSourceReady).toBe(false);
  });

  it('B. both keys present in synthetic env file => readiness YES', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_TS_KEY\nOPENAI_API_KEY=SYNTHETIC_OA_KEY\n',
      async (filePath) => {
        const result = await checkLocalProviderEnvSource({ envFilePath: filePath });
        expect(result.envFileExists).toBe(true);
        expect(result.typeSafeCredentialPresent).toBe(true);
        expect(result.openAiCredentialPresent).toBe(true);
        expect(result.sanitizedChildSourceReady).toBe(true);
      },
    );
  });

  it('C. TypeSafe key missing => readiness NO', async () => {
    await withTempSyntheticEnv('OPENAI_API_KEY=SYNTHETIC_OA_KEY\n', async (filePath) => {
      const result = await checkLocalProviderEnvSource({ envFilePath: filePath });
      expect(result.envFileExists).toBe(true);
      expect(result.typeSafeCredentialPresent).toBe(false);
      expect(result.openAiCredentialPresent).toBe(true);
      expect(result.sanitizedChildSourceReady).toBe(false);
    });
  });

  it('D. OpenAI key missing => readiness NO', async () => {
    await withTempSyntheticEnv('TYPESAFE_API_KEY=SYNTHETIC_TS_KEY\n', async (filePath) => {
      const result = await checkLocalProviderEnvSource({ envFilePath: filePath });
      expect(result.envFileExists).toBe(true);
      expect(result.typeSafeCredentialPresent).toBe(true);
      expect(result.openAiCredentialPresent).toBe(false);
      expect(result.sanitizedChildSourceReady).toBe(false);
    });
  });

  it('E. parent process contains conflicting variable => sanitized child isolates to file', async () => {
    const parentTs = 'PARENT_CONFLICTING_TS';
    const parentOa = 'PARENT_CONFLICTING_OA';
    const previousTs = process.env.TYPESAFE_API_KEY;
    const previousOa = process.env.OPENAI_API_KEY;
    try {
      process.env.TYPESAFE_API_KEY = parentTs;
      process.env.OPENAI_API_KEY = parentOa;

      await withTempSyntheticEnv(
        'TYPESAFE_API_KEY=FILE_SYNTHETIC_TS\nOPENAI_API_KEY=FILE_SYNTHETIC_OA\n',
        async (filePath) => {
          const result = await checkLocalProviderEnvSource({ envFilePath: filePath });
          expect(result.sanitizedChildSourceReady).toBe(true);
          expect(process.env.TYPESAFE_API_KEY).toBe(parentTs);
          expect(process.env.OPENAI_API_KEY).toBe(parentOa);
        },
      );
    } finally {
      if (previousTs !== undefined) process.env.TYPESAFE_API_KEY = previousTs;
      else delete process.env.TYPESAFE_API_KEY;
      if (previousOa !== undefined) process.env.OPENAI_API_KEY = previousOa;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it('F & G. output formatted contains only boolean statuses and zero secret values or fingerprints', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_SECRET_A\nOPENAI_API_KEY=SYNTHETIC_SECRET_B\n',
      async (filePath) => {
        const result = await checkLocalProviderEnvSource({ envFilePath: filePath });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('SYNTHETIC_SECRET_A');
        expect(serialized).not.toContain('SYNTHETIC_SECRET_B');
        expect(serialized).not.toContain('length');
        expect(serialized).not.toContain('hash');
        expect(serialized).not.toContain('fingerprint');
      },
    );
  });

  it('H, I, J. CLI parser requires explicit --env-file and rejects arbitrary arguments', () => {
    expect(() => parsePreflightCliArgs([])).toThrow('MISSING_ENV_FILE_ARGUMENT');
    expect(() => parsePreflightCliArgs(['--forward-cmd', 'calc.exe'])).toThrow(
      'UNRECOGNIZED_PREFLIGHT_ARGUMENT',
    );
    const parsed = parsePreflightCliArgs(['--env-file', 'test.env']);
    expect(parsed.envFilePath).toBe('test.env');
  });
});
