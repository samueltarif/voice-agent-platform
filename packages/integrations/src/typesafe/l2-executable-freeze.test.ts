import { describe, expect, it, vi } from 'vitest';
import {
  computeL2ExecutableFreeze,
  resolveManifest,
  validateManifestData,
  validateModulePath,
  L2_EXECUTABLE_MODULES,
  EXPECTED_L2_EXECUTABLE_MODULE_COUNT,
  FREEZE_METHOD_VERSION,
} from '../../../../scripts/benchmarks/voice/compute-l2-executable-freeze.mjs';

const defaultTestManifest = {
  version: FREEZE_METHOD_VERSION,
  expectedModuleCount: EXPECTED_L2_EXECUTABLE_MODULE_COUNT,
  executableModules: [...L2_EXECUTABLE_MODULES],
};

function createMockBytesProvider(overrides: Record<string, string> = {}) {
  return (modPath: string) => {
    if (modPath.endsWith('.json')) {
      return Buffer.from(JSON.stringify(defaultTestManifest), 'utf8');
    }
    if (overrides[modPath] !== undefined) {
      return Buffer.from(overrides[modPath], 'utf8');
    }
    return Buffer.from(`// Content of ${modPath}\n`, 'utf8');
  };
}

describe('L2 Executable Freeze Reproducibility Tests', () => {
  it('Case A: same tracked HEAD + file set produces identical aggregate across independent invocations', () => {
    const run1 = computeL2ExecutableFreeze();
    const run2 = computeL2ExecutableFreeze();

    expect(run1.executableAggregateSha256).toBe(run2.executableAggregateSha256);
    expect(run1.runtimeFileCount).toBe(EXPECTED_L2_EXECUTABLE_MODULE_COUNT);
    expect(run1.freezeMethodVersion).toBe(FREEZE_METHOD_VERSION);
    expect(run1.runtimeFileSet).toEqual(
      [...L2_EXECUTABLE_MODULES].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }, 15000);

  it('Case B: canonical ordering is based on deterministic ASCII code-unit ordering without localeCompare', () => {
    const localeCompareSpy = vi.spyOn(String.prototype, 'localeCompare');
    const reversedModules = [...L2_EXECUTABLE_MODULES].reverse();
    const manifestReversed = {
      version: FREEZE_METHOD_VERSION,
      expectedModuleCount: EXPECTED_L2_EXECUTABLE_MODULE_COUNT,
      executableModules: reversedModules,
    };

    const runNormal = computeL2ExecutableFreeze({
      readBytes: createMockBytesProvider(),
      sourceHead: 'TEST_HEAD',
    });
    const runReversed = computeL2ExecutableFreeze({
      manifest: manifestReversed,
      readBytes: createMockBytesProvider(),
      sourceHead: 'TEST_HEAD',
    });

    expect(runNormal.executableAggregateSha256).toBe(runReversed.executableAggregateSha256);
    expect(runReversed.runtimeFileSet).toEqual(
      [...L2_EXECUTABLE_MODULES].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(localeCompareSpy).not.toHaveBeenCalled();
    localeCompareSpy.mockRestore();
  });

  it('Case C: changing one byte in controlled fixture content changes the aggregate', () => {
    const targetFile = 'scripts/benchmarks/voice/l2-runner-cost-ceiling.mjs';
    const baseRun = computeL2ExecutableFreeze({
      readBytes: createMockBytesProvider(),
      sourceHead: 'TEST_HEAD',
    });
    const modifiedRun = computeL2ExecutableFreeze({
      readBytes: createMockBytesProvider({ [targetFile]: '// Modified byte\n' }),
      sourceHead: 'TEST_HEAD',
    });

    expect(baseRun.executableAggregateSha256).not.toBe(modifiedRun.executableAggregateSha256);
    expect(baseRun.perFileSha256[targetFile]).not.toBe(modifiedRun.perFileSha256[targetFile]);
  });

  it('Case D: missing required file fails closed', () => {
    expect(() =>
      computeL2ExecutableFreeze({
        readBytes: (path: string) => {
          if (path.includes('l2-runner-cost-ceiling.mjs')) {
            throw new Error('File not found');
          }
          return Buffer.from('test');
        },
      }),
    ).toThrow();
  });

  it('Case E: duplicate manifest entry fails closed', () => {
    const duplicateModules = [...L2_EXECUTABLE_MODULES.slice(0, 9), L2_EXECUTABLE_MODULES[0]];
    const invalidManifest = {
      version: FREEZE_METHOD_VERSION,
      expectedModuleCount: EXPECTED_L2_EXECUTABLE_MODULE_COUNT,
      executableModules: duplicateModules,
    };

    expect(() => validateManifestData(invalidManifest)).toThrow('Duplicate module paths');
  });

  it('Case F: path traversal or outside-repo path fails closed', () => {
    expect(() => validateModulePath('../secret.mjs')).toThrow('Path traversal');
    expect(() => validateModulePath('/etc/passwd.mjs')).toThrow('Path traversal');
    expect(() => validateModulePath('packages/database/schema.mjs')).toThrow(
      'outside expected benchmark runner namespace',
    );
  });

  it('Case G: unexpected executable-set mismatch fails closed', () => {
    const missingOne = {
      version: FREEZE_METHOD_VERSION,
      expectedModuleCount: 9,
      executableModules: L2_EXECUTABLE_MODULES.slice(0, 9),
    };
    expect(() => validateManifestData(missingOne)).toThrow('Expected 10 modules');

    const foreignModule = {
      version: FREEZE_METHOD_VERSION,
      expectedModuleCount: 10,
      executableModules: [
        ...L2_EXECUTABLE_MODULES.slice(0, 9),
        'scripts/benchmarks/voice/unknown-extra.mjs',
      ],
    };
    expect(() => validateManifestData(foreignModule)).toThrow('Unexpected executable module');
  });

  it('Case H: freeze tooling performs zero provider/network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = computeL2ExecutableFreeze();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.runtimeFileCount).toBe(10);
    fetchSpy.mockRestore();
  });

  it('Case I: no real credentials required', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.TWILIO_AUTH_TOKEN;

    try {
      const result = computeL2ExecutableFreeze();
      expect(result.executableAggregateSha256).toBeDefined();
      expect(result.executableAggregateSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      process.env = originalEnv;
    }
  }, 15000);

  it('Case J: no .env access during freeze computation', () => {
    const result = computeL2ExecutableFreeze();
    expect(result.runtimeFileSet.every((f) => !f.includes('.env'))).toBe(true);
    expect(Object.keys(result.perFileSha256).every((f) => !f.includes('.env'))).toBe(true);
  });

  it('Case K: missing manifest in requested Git ref fails closed without working-tree fallback', () => {
    expect(() =>
      resolveManifest(process.cwd(), 'non-existent-ref-0000000000000000000000000000000000000000'),
    ).toThrow(/Failed to read manifest/);
  });
});
