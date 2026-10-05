#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeSha256,
  constructCanonicalMaterial,
  getSourceHead,
  resolveManifest,
  resolveModuleBytes,
  validateModulePath,
} from './compute-l2-executable-freeze.mjs';

export { computeSha256 };
export const FREEZE_METHOD_VERSION = '1.0.0';
export const EXPECTED_V2_EXECUTABLE_MODULE_COUNT = 9;
export const DEFAULT_V2_MANIFEST_PATH =
  'scripts/benchmarks/voice/l2-mixed-intent-v2-executable-freeze-manifest.json';

export const V2_EXECUTABLE_MODULES = Object.freeze([
  'scripts/benchmarks/voice/l2-mixed-intent-v2-request-caps.mjs',
  'scripts/benchmarks/voice/l2-mixed-intent-v2-result-classification.mjs',
  'scripts/benchmarks/voice/l2-mixed-intent-v2-provider-dispatch.mjs',
  'scripts/benchmarks/voice/l2-mixed-intent-v2-case-execution.mjs',
  'scripts/benchmarks/voice/l2-mixed-intent-v2-artifact.mjs',
  'scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2.mjs',
  'scripts/benchmarks/voice/compute-l2-mixed-intent-v2-executable-freeze.mjs',
  'scripts/benchmarks/voice/l2-runner-result-classification.mjs',
  'scripts/benchmarks/voice/l2-runner-preconditions.mjs',
]);

export function validateV2ManifestData(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('V2 manifest must be a non-null object');
  }
  if (manifest.version !== FREEZE_METHOD_VERSION) {
    throw new Error(`Unsupported v2 manifest version: ${manifest.version}`);
  }
  if (!Array.isArray(manifest.executableModules)) {
    throw new Error('V2 manifest executableModules must be an array');
  }
  if (manifest.executableModules.length !== EXPECTED_V2_EXECUTABLE_MODULE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_V2_EXECUTABLE_MODULE_COUNT} v2 modules, got ${manifest.executableModules.length}`,
    );
  }
  if (new Set(manifest.executableModules).size !== manifest.executableModules.length) {
    throw new Error('Duplicate module paths found in v2 manifest');
  }
  const expectedSet = new Set(V2_EXECUTABLE_MODULES);
  for (const modPath of manifest.executableModules) {
    validateModulePath(modPath);
    if (!expectedSet.has(modPath)) {
      throw new Error(`Unexpected executable module in v2 manifest: ${modPath}`);
    }
  }
}

export function computeMixedIntentV2Freeze(options = {}) {
  const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const ref = options.ref ?? 'HEAD';
  const manifest =
    options.manifest ??
    resolveManifest(repoRoot, ref, {
      ...options,
      manifestPath: options.manifestPath ?? DEFAULT_V2_MANIFEST_PATH,
    });
  validateV2ManifestData(manifest);
  const filesWithSha = manifest.executableModules.map((modPath) => ({
    path: modPath,
    sha256: computeSha256(resolveModuleBytes(modPath, repoRoot, { ref, ...options })),
  }));
  const canonicalMaterial = constructCanonicalMaterial(filesWithSha);
  const aggregateSha = computeSha256(Buffer.from(canonicalMaterial, 'utf8'));
  const sortedFiles = [...filesWithSha].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  return {
    freezeMethodVersion: FREEZE_METHOD_VERSION,
    runtimeFileCount: sortedFiles.length,
    runtimeFileSet: sortedFiles.map((f) => f.path),
    perFileSha256: Object.fromEntries(sortedFiles.map((f) => [f.path, f.sha256])),
    executableAggregateSha256: aggregateSha,
    sourceHead: getSourceHead(repoRoot, ref, options),
  };
}

export function formatV2FreezeReport(result) {
  const fileLines = Object.entries(result.perFileSha256).map(([p, s]) => `  ${p} -> ${s}`);
  return [
    '=== L2 MIXED-INTENT V2 EXECUTABLE FREEZE REPORT ===',
    `FREEZE_METHOD_VERSION: ${result.freezeMethodVersion}`,
    `RUNTIME_FILE_COUNT: ${result.runtimeFileCount}`,
    `EXECUTABLE_AGGREGATE_SHA256: ${result.executableAggregateSha256}`,
    `SOURCE_HEAD: ${result.sourceHead}`,
    '',
    'PER_FILE_SHA256:',
    ...fileLines,
  ].join('\n');
}

export function runV2Cli(argv = process.argv.slice(2)) {
  const isJson = argv.includes('--json');
  try {
    const result = computeMixedIntentV2Freeze();
    console.log(isJson ? JSON.stringify(result, null, 2) : formatV2FreezeReport(result));
    return 0;
  } catch (err) {
    console.error(`FATAL_V2_FREEZE_COMPUTATION_ERROR: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = runV2Cli();
}
