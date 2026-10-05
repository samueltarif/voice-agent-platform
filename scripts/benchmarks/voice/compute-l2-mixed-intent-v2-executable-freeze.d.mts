export const FREEZE_METHOD_VERSION: string;
export const EXPECTED_V2_EXECUTABLE_MODULE_COUNT: number;
export const DEFAULT_V2_MANIFEST_PATH: string;
export const V2_EXECUTABLE_MODULES: readonly string[];

export function computeSha256(content: string | Buffer): string;
export function validateV2ManifestData(manifest: {
  version?: string | undefined;
  expectedModuleCount?: number | undefined;
  executableModules?: string[] | undefined;
}): void;

export interface V2FreezeResult {
  freezeMethodVersion: string;
  runtimeFileCount: number;
  runtimeFileSet: string[];
  perFileSha256: Record<string, string>;
  executableAggregateSha256: string;
  sourceHead: string;
}

export function computeMixedIntentV2Freeze(options?: {
  repoRoot?: string | undefined;
  ref?: string | undefined;
  manifest?:
    | {
        version?: string | undefined;
        expectedModuleCount?: number | undefined;
        executableModules?: string[] | undefined;
      }
    | undefined;
  manifestPath?: string | undefined;
  readBytes?: ((modPath: string) => Buffer) | undefined;
  sourceHead?: string | undefined;
}): V2FreezeResult;
export function formatV2FreezeReport(result: V2FreezeResult): string;
export function runV2Cli(argv?: string[]): number;
