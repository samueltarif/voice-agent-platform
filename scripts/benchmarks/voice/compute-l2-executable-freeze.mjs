#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FREEZE_METHOD_VERSION = '1.0.0';
export const EXPECTED_L2_EXECUTABLE_MODULE_COUNT = 10;
export const DEFAULT_MANIFEST_PATH = 'scripts/benchmarks/voice/l2-executable-freeze-manifest.json';

export const L2_EXECUTABLE_MODULES = Object.freeze([
  'scripts/benchmarks/voice/l2-runner-artifact.mjs',
  'scripts/benchmarks/voice/l2-runner-case-execution.mjs',
  'scripts/benchmarks/voice/l2-runner-cost-ceiling.mjs',
  'scripts/benchmarks/voice/l2-runner-dependencies.mjs',
  'scripts/benchmarks/voice/l2-runner-input-budget.mjs',
  'scripts/benchmarks/voice/l2-runner-preconditions.mjs',
  'scripts/benchmarks/voice/l2-runner-provider-dispatch.mjs',
  'scripts/benchmarks/voice/l2-runner-request-caps.mjs',
  'scripts/benchmarks/voice/l2-runner-result-classification.mjs',
  'scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs',
]);

export function computeSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function validateModulePath(modPath) {
  if (typeof modPath !== 'string' || modPath.trim().length === 0) {
    throw new Error('Invalid module path: must be a non-empty string');
  }
  if (modPath.includes('..') || modPath.startsWith('/') || modPath.startsWith('\\')) {
    throw new Error(`Path traversal or absolute path disallowed: ${modPath}`);
  }
  if (!modPath.startsWith('scripts/benchmarks/voice/') || !modPath.endsWith('.mjs')) {
    throw new Error(`Module path outside expected benchmark runner namespace: ${modPath}`);
  }
}

export function validateManifestData(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Manifest must be a non-null object');
  }
  if (manifest.version !== FREEZE_METHOD_VERSION) {
    throw new Error(
      `Unsupported manifest version: ${manifest.version} (expected ${FREEZE_METHOD_VERSION})`,
    );
  }
  if (!Array.isArray(manifest.executableModules)) {
    throw new Error('Manifest executableModules must be an array');
  }
  if (manifest.executableModules.length !== EXPECTED_L2_EXECUTABLE_MODULE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_L2_EXECUTABLE_MODULE_COUNT} modules, got ${manifest.executableModules.length}`,
    );
  }
  const uniquePaths = new Set(manifest.executableModules);
  if (uniquePaths.size !== manifest.executableModules.length) {
    throw new Error('Duplicate module paths found in manifest');
  }
  const expectedSet = new Set(L2_EXECUTABLE_MODULES);
  for (const modPath of manifest.executableModules) {
    validateModulePath(modPath);
    if (!expectedSet.has(modPath)) {
      throw new Error(`Unexpected executable module in manifest: ${modPath}`);
    }
  }
}

export function resolveModuleBytes(modPath, repoRoot, options = {}) {
  const opts = typeof options === 'string' ? { ref: options } : options;
  if (opts.readBytes) {
    const customBytes = opts.readBytes(modPath);
    if (!customBytes) throw new Error(`Failed to read required module content: ${modPath}`);
    return Buffer.isBuffer(customBytes) ? customBytes : Buffer.from(customBytes);
  }
  const ref = opts.ref ?? 'HEAD';
  try {
    return execFileSync('git', ['-C', repoRoot, 'show', `${ref}:${modPath}`], {
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch (err) {
    throw new Error(`Failed to read tracked file ${modPath} from ref ${ref}: ${err.message}`);
  }
}

export function constructCanonicalMaterial(filesWithSha) {
  const sorted = [...filesWithSha].sort((a, b) => a.path.localeCompare(b.path));
  return (
    `FREEZE_METHOD_VERSION:${FREEZE_METHOD_VERSION}\n` +
    sorted.map((e) => `${e.path}:${e.sha256}\n`).join('')
  );
}

export function resolveManifest(repoRoot, ref, options = {}) {
  if (options.manifest) return options.manifest;
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  if (options.readBytes) {
    return JSON.parse(options.readBytes(manifestPath).toString('utf8'));
  }
  try {
    const raw = execFileSync('git', ['-C', repoRoot, 'show', `${ref}:${manifestPath}`], {
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8'));
  }
}

export function getSourceHead(repoRoot, ref, options = {}) {
  if (options.sourceHead) return options.sourceHead;
  try {
    return execFileSync('git', ['-C', repoRoot, 'rev-parse', ref], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

export function computeL2ExecutableFreeze(options = {}) {
  const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const ref = options.ref ?? 'HEAD';
  const manifest = resolveManifest(repoRoot, ref, options);
  validateManifestData(manifest);

  const filesWithSha = manifest.executableModules.map((modPath) => ({
    path: modPath,
    sha256: computeSha256(resolveModuleBytes(modPath, repoRoot, { ref, ...options })),
  }));

  const canonicalMaterial = constructCanonicalMaterial(filesWithSha);
  const aggregateSha = computeSha256(Buffer.from(canonicalMaterial, 'utf8'));
  const sortedFiles = [...filesWithSha].sort((a, b) => a.path.localeCompare(b.path));

  return {
    freezeMethodVersion: FREEZE_METHOD_VERSION,
    runtimeFileCount: sortedFiles.length,
    runtimeFileSet: sortedFiles.map((f) => f.path),
    perFileSha256: Object.fromEntries(sortedFiles.map((f) => [f.path, f.sha256])),
    executableAggregateSha256: aggregateSha,
    sourceHead: getSourceHead(repoRoot, ref, options),
  };
}

export function formatFreezeReport(result) {
  const fileLines = Object.entries(result.perFileSha256).map(([p, s]) => `  ${p} -> ${s}`);
  return [
    '=== L2 EXECUTABLE FREEZE REPORT ===',
    `FREEZE_METHOD_VERSION: ${result.freezeMethodVersion}`,
    `RUNTIME_FILE_COUNT: ${result.runtimeFileCount}`,
    `EXECUTABLE_AGGREGATE_SHA256: ${result.executableAggregateSha256}`,
    `SOURCE_HEAD: ${result.sourceHead}`,
    '',
    'PER_FILE_SHA256:',
    ...fileLines,
  ].join('\n');
}

export function runCli(argv = process.argv.slice(2)) {
  const isJson = argv.includes('--json');
  try {
    const result = computeL2ExecutableFreeze();
    console.log(isJson ? JSON.stringify(result, null, 2) : formatFreezeReport(result));
    return 0;
  } catch (err) {
    console.error(`FATAL_FREEZE_COMPUTATION_ERROR: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = runCli();
}
