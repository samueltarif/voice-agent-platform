import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkTargetedV2TechnicalReadiness,
  formatTechnicalReadinessReport,
  parseTechnicalReadinessCliArgs,
} from '../../../../scripts/benchmarks/voice/check-targeted-v2-technical-readiness.mjs';

const tempFixtureDir = resolve('packages/integrations/src/typesafe');

function withTempSyntheticEnv(content: string, testFn: (filePath: string) => Promise<void>) {
  const filePath = resolve(
    tempFixtureDir,
    `temp-synthetic-readiness-${Date.now()}-${Math.random().toString(36).slice(2)}.env`,
  );
  writeFileSync(filePath, content, 'utf8');
  return testFn(filePath).finally(() => {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  });
}

describe('006BO no-network technical readiness preflight', () => {
  it('A. valid synthetic env + all canonical freezes/config match => TECHNICAL_PREREQUISITES_READY = true', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_VALID_TS\nOPENAI_API_KEY=SYNTHETIC_VALID_OA\n',
      async (filePath) => {
        const result = await checkTargetedV2TechnicalReadiness({ envFilePath: filePath });
        expect(result.envSourceReady).toBe(true);
        expect(result.datasetFreezeMatch).toBe(true);
        expect(result.liveExecutableFreezeMatch).toBe(true);
        expect(result.studyConfigurationMatch).toBe(true);
        expect(result.technicalPrerequisitesReady).toBe(true);
        expect(result.liveAuthorizationEvaluated).toBe(false);
        expect(result.liveAuthorizationGrantedByThisTool).toBe(false);

        const report = formatTechnicalReadinessReport(result);
        expect(report).toContain('TECHNICAL_PREREQUISITES_READY = YES');
        expect(report).toContain('LIVE_AUTHORIZATION_EVALUATED = NO');
        expect(report).toContain('LIVE_AUTHORIZATION_GRANTED_BY_THIS_TOOL = NO');
        expect(report).not.toContain('LIVE_READY = YES');
        expect(report).not.toContain('AUTHORIZED = YES');
        expect(report).not.toContain('SAFE_TO_DISPATCH = YES');
      },
    );
  });

  it('B. env source not ready => technical readiness NO', async () => {
    const missingPath = resolve(tempFixtureDir, 'missing-file.env');
    const result = await checkTargetedV2TechnicalReadiness({ envFilePath: missingPath });
    expect(result.envSourceReady).toBe(false);
    expect(result.technicalPrerequisitesReady).toBe(false);
  });

  it('C. dataset hash mismatch => technical readiness NO', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_VALID_TS\nOPENAI_API_KEY=SYNTHETIC_VALID_OA\n',
      async (filePath) => {
        const result = await checkTargetedV2TechnicalReadiness({
          envFilePath: filePath,
          overrideDatasetSha256: 'corrupted-dataset-sha',
        });
        expect(result.datasetFreezeMatch).toBe(false);
        expect(result.technicalPrerequisitesReady).toBe(false);
      },
    );
  });

  it('D. live executable freeze mismatch => technical readiness NO', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_VALID_TS\nOPENAI_API_KEY=SYNTHETIC_VALID_OA\n',
      async (filePath) => {
        const result = await checkTargetedV2TechnicalReadiness({
          envFilePath: filePath,
          overrideLiveExecutableFreezeSha256: 'corrupted-live-freeze-sha',
        });
        expect(result.liveExecutableFreezeMatch).toBe(false);
        expect(result.technicalPrerequisitesReady).toBe(false);
      },
    );
  });

  it('E. model / config mismatch => technical readiness NO', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_VALID_TS\nOPENAI_API_KEY=SYNTHETIC_VALID_OA\n',
      async (filePath) => {
        const result = await checkTargetedV2TechnicalReadiness({
          envFilePath: filePath,
          overrideStudyConfig: { typeSafeModel: 'unauthorized-model' },
        });
        expect(result.studyConfigurationMatch).toBe(false);
        expect(result.technicalPrerequisitesReady).toBe(false);
      },
    );
  });

  it('F. inherited conflicting parent variable => preserves 006BN sanitized child behavior', async () => {
    const parentTs = 'PARENT_CONFLICTING_TS';
    const parentOa = 'PARENT_CONFLICTING_OA';
    const prevTs = process.env.TYPESAFE_API_KEY;
    const prevOa = process.env.OPENAI_API_KEY;
    try {
      process.env.TYPESAFE_API_KEY = parentTs;
      process.env.OPENAI_API_KEY = parentOa;

      await withTempSyntheticEnv(
        'TYPESAFE_API_KEY=SYNTHETIC_FILE_TS\nOPENAI_API_KEY=SYNTHETIC_FILE_OA\n',
        async (filePath) => {
          const result = await checkTargetedV2TechnicalReadiness({ envFilePath: filePath });
          expect(result.envSourceReady).toBe(true);
          expect(result.technicalPrerequisitesReady).toBe(true);
          expect(process.env.TYPESAFE_API_KEY).toBe(parentTs);
          expect(process.env.OPENAI_API_KEY).toBe(parentOa);
        },
      );
    } finally {
      if (prevTs !== undefined) process.env.TYPESAFE_API_KEY = prevTs;
      else delete process.env.TYPESAFE_API_KEY;
      if (prevOa !== undefined) process.env.OPENAI_API_KEY = prevOa;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it('G & H. report and serialized results contain zero secret values, hashes, or fingerprints', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_SECRET_ONE\nOPENAI_API_KEY=SYNTHETIC_SECRET_TWO\n',
      async (filePath) => {
        const result = await checkTargetedV2TechnicalReadiness({ envFilePath: filePath });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('SYNTHETIC_SECRET_ONE');
        expect(serialized).not.toContain('SYNTHETIC_SECRET_TWO');
        expect(serialized).not.toContain('SECRET');

        const report = formatTechnicalReadinessReport(result);
        expect(report).not.toContain('SYNTHETIC_SECRET_ONE');
        expect(report).not.toContain('SYNTHETIC_SECRET_TWO');
      },
    );
  });

  it('K. CLI argument parsing requires --env-file and rejects unrecognized arguments', () => {
    expect(() => parseTechnicalReadinessCliArgs([])).toThrow('MISSING_ENV_FILE_ARGUMENT');
    expect(() => parseTechnicalReadinessCliArgs(['--arbitrary-cmd', 'echo 1'])).toThrow(
      'UNRECOGNIZED_PREFLIGHT_ARGUMENT',
    );
    const parsed = parseTechnicalReadinessCliArgs(['--env-file', 'test.env']);
    expect(parsed.envFilePath).toBe('test.env');
  });

  it('L & M. human authorization is explicitly NOT evaluated and readiness never implies authorization', async () => {
    await withTempSyntheticEnv(
      'TYPESAFE_API_KEY=SYNTHETIC_TS\nOPENAI_API_KEY=SYNTHETIC_OA\n',
      async (filePath) => {
        const result = await checkTargetedV2TechnicalReadiness({ envFilePath: filePath });
        expect(result.liveAuthorizationEvaluated).toBe(false);
        expect(result.liveAuthorizationGrantedByThisTool).toBe(false);

        const report = formatTechnicalReadinessReport(result);
        expect(report).toContain('LIVE_AUTHORIZATION_EVALUATED = NO');
        expect(report).toContain('LIVE_AUTHORIZATION_GRANTED_BY_THIS_TOOL = NO');
        expect(report).not.toMatch(/LIVE_READY\s*=\s*YES/);
        expect(report).not.toMatch(/AUTHORIZED\s*=\s*YES/);
      },
    );
  });
});
