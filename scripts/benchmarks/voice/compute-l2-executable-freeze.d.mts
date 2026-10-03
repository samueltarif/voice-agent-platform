export const FREEZE_METHOD_VERSION: string;
export const EXPECTED_L2_EXECUTABLE_MODULE_COUNT: number;
export const DEFAULT_MANIFEST_PATH: string;
export const L2_EXECUTABLE_MODULES: readonly string[];

export interface FreezeResult {
  freezeMethodVersion: string;
  runtimeFileCount: number;
  runtimeFileSet: string[];
  perFileSha256: Record<string, string>;
  executableAggregateSha256: string;
  sourceHead: string;
}

export interface ComputeFreezeOptions {
  repoRoot?: string;
  ref?: string;
  manifestPath?: string;
  manifest?: unknown;
  sourceHead?: string;
  readBytes?: (path: string) => Buffer | Uint8Array;
}

export function computeSha256(content: Buffer | Uint8Array | string): string;
export function validateModulePath(modPath: string): void;
export function validateManifestData(manifest: unknown): void;
export function resolveModuleBytes(
  modPath: string,
  repoRoot: string,
  options?: string | ComputeFreezeOptions,
): Buffer;
export function constructCanonicalMaterial(
  filesWithSha: Array<{ path: string; sha256: string }>,
): string;
export function resolveManifest(
  repoRoot: string,
  ref: string,
  options?: ComputeFreezeOptions,
): unknown;
export function getSourceHead(
  repoRoot: string,
  ref: string,
  options?: ComputeFreezeOptions,
): string;
export function computeL2ExecutableFreeze(options?: ComputeFreezeOptions): FreezeResult;
export function formatFreezeReport(result: FreezeResult): string;
export function runCli(argv?: string[]): number;
