import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeL2ExecutableFreeze } from '../../../../scripts/benchmarks/voice/compute-l2-executable-freeze.mjs';
import {
  EXPECTED_V2_EXECUTABLE_MODULE_COUNT,
  FREEZE_METHOD_VERSION,
  V2_EXECUTABLE_MODULES,
  computeMixedIntentV2Freeze,
  validateV2ManifestData,
} from '../../../../scripts/benchmarks/voice/compute-l2-mixed-intent-v2-executable-freeze.mjs';

const HISTORICAL_V1_AGGREGATE = 'f5ef6e6b88e09094765b0c3b273ba23cae01502bdd0ec4fe28dbcb3f2133794a';

const defaultV2Manifest = {
  version: FREEZE_METHOD_VERSION,
  expectedModuleCount: EXPECTED_V2_EXECUTABLE_MODULE_COUNT,
  executableModules: [...V2_EXECUTABLE_MODULES],
};

function createMockV2BytesProvider(overrides: Record<string, string> = {}) {
  return (modPath: string) => {
    if (modPath.endsWith('.json')) {
      return Buffer.from(JSON.stringify(defaultV2Manifest), 'utf8');
    }
    if (overrides[modPath] !== undefined) {
      return Buffer.from(overrides[modPath], 'utf8');
    }
    return Buffer.from(`// Content of ${modPath}\n`, 'utf8');
  };
}

describe('L2 Mixed-Intent v2 Executable Freeze (Slice 006BF)', () => {
  it('v2 freeze is deterministic across independent invocations', () => {
    const run1 = computeMixedIntentV2Freeze({
      readBytes: createMockV2BytesProvider(),
      sourceHead: 'TEST_HEAD',
    });
    const run2 = computeMixedIntentV2Freeze({
      readBytes: createMockV2BytesProvider(),
      sourceHead: 'TEST_HEAD',
    });
    expect(run1.executableAggregateSha256).toBe(run2.executableAggregateSha256);
    expect(run1.runtimeFileCount).toBe(EXPECTED_V2_EXECUTABLE_MODULE_COUNT);
    expect(run1.freezeMethodVersion).toBe('1.0.0');
    expect(run1.runtimeFileSet).toEqual(
      [...V2_EXECUTABLE_MODULES].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });

  it('v2 manifest enumerates exactly the 9 narrowly named v2 and transitive modules', () => {
    expect(EXPECTED_V2_EXECUTABLE_MODULE_COUNT).toBe(9);
    expect(V2_EXECUTABLE_MODULES).toHaveLength(9);
    for (const mod of V2_EXECUTABLE_MODULES) {
      expect(mod.startsWith('scripts/benchmarks/voice/')).toBe(true);
      expect(mod.endsWith('.mjs')).toBe(true);
    }
    expect(V2_EXECUTABLE_MODULES).toContain(
      'scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2.mjs',
    );
    expect(new Set(V2_EXECUTABLE_MODULES).size).toBe(9);
  });

  it('v2 manifest rejects duplicates, missing modules and out-of-namespace paths', () => {
    const duplicated = {
      ...defaultV2Manifest,
      executableModules: [
        ...V2_EXECUTABLE_MODULES.slice(0, 8),
        'scripts/benchmarks/voice/l2-mixed-intent-v2-request-caps.mjs',
      ],
    };
    expect(() => validateV2ManifestData(duplicated)).toThrow('Duplicate module paths');
    const short = {
      ...defaultV2Manifest,
      executableModules: V2_EXECUTABLE_MODULES.slice(0, 8),
    };
    expect(() => validateV2ManifestData(short)).toThrow();
    expect(() =>
      computeMixedIntentV2Freeze({
        readBytes: (path: string) => {
          if (path.includes('l2-mixed-intent-v2-case-execution.mjs')) {
            throw new Error('File not found');
          }
          return createMockV2BytesProvider()(path);
        },
        sourceHead: 'TEST_HEAD',
      }),
    ).toThrow();
  });

  it('tracked v2 freeze on HEAD is reproducible', { timeout: 30000 }, () => {
    const run1 = computeMixedIntentV2Freeze();
    const run2 = computeMixedIntentV2Freeze();
    expect(run1.executableAggregateSha256).toBe(run2.executableAggregateSha256);
    expect(run1.runtimeFileCount).toBe(9);
  });

  it('historical v1 freeze manifest and aggregate remain untouched', { timeout: 15000 }, () => {
    const manifest = JSON.parse(
      readFileSync('scripts/benchmarks/voice/l2-executable-freeze-manifest.json', 'utf8'),
    );
    expect(manifest.executableModules).toHaveLength(10);
    const v1 = computeL2ExecutableFreeze();
    expect(v1.executableAggregateSha256).toBe(HISTORICAL_V1_AGGREGATE);
  });
});
