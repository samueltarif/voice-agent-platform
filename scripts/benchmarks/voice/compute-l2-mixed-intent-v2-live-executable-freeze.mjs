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
export const AUTHORIZED_V2_LIVE_FREEZE_METHOD_VERSION = '1.0.0';
export const EXPECTED_AUTHORIZED_V2_LIVE_MODULE_COUNT = 3;
export const DEFAULT_AUTHORIZED_V2_LIVE_MANIFEST_PATH =
  'scripts/benchmarks/voice/l2-mixed-intent-v2-live-executable-freeze-manifest.json';

export const AUTHORIZED_V2_LIVE_EXECUTABLE_MODULES = Object.freeze([
  'scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2-live.mjs',
  'scripts/benchmarks/voice/l2-mixed-intent-v2-authorized-preconditions.mjs',
  'scripts/benchmarks/voice/compute-l2-mixed-intent-v2-live-executable-freeze.mjs',
]);

export function validateAuthorizedV2LiveManifestData(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Authorized v2 live manifest must be a non-null object');
  }
  if (manifest.version !== AUTHORIZED_V2_LIVE_FREEZE_METHOD_VERSION) {
    throw new Error(`Unsupported live manifest version: ${manifest.version}`);
  }
  if (!Array.isArray(manifest.executableModules)) {
    throw new Error('Live manifest executableModules must be an array');
  }
  if (manifest.executableModules.length !== EXPECTED_AUTHORIZED_V2_LIVE_MODULE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_AUTHORIZED_V2_LIVE_MODULE_COUNT} live modules, got ${manifest.executableModules.length}`,
    );
  }
  if (new Set(manifest.executableModules).size !== manifest.executableModules.length) {
    throw new Error('Duplicate module paths found in live manifest');
  }
  const expectedSet = new Set(AUTHORIZED_V2_LIVE_EXECUTABLE_MODULES);
  for (const modPath of manifest.executableModules) {
    validateModulePath(modPath);
    if (!expectedSet.has(modPath)) {
      throw new Error(`Unexpected executable module in live manifest: ${modPath}`);
    }
  }
}

export function computeAuthorizedV2LiveFreeze(options = {}) {
  const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const ref = options.ref ?? 'HEAD';
  const manifest =
    options.manifest ??
    resolveManifest(repoRoot, ref, {
      ...options,
      manifestPath: options.manifestPath ?? DEFAULT_AUTHORIZED_V2_LIVE_MANIFEST_PATH,
    });
  validateAuthorizedV2LiveManifestData(manifest);
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
    freezeMethodVersion: AUTHORIZED_V2_LIVE_FREEZE_METHOD_VERSION,
    runtimeFileCount: sortedFiles.length,
    runtimeFileSet: sortedFiles.map((f) => f.path),
    perFileSha256: Object.fromEntries(sortedFiles.map((f) => [f.path, f.sha256])),
    executableAggregateSha256: aggregateSha,
    sourceHead: getSourceHead(repoRoot, ref, options),
  };
}
