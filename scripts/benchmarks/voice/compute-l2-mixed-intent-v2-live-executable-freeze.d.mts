export const AUTHORIZED_V2_LIVE_FREEZE_METHOD_VERSION: string;
export const EXPECTED_AUTHORIZED_V2_LIVE_MODULE_COUNT: number;
export const DEFAULT_AUTHORIZED_V2_LIVE_MANIFEST_PATH: string;
export const AUTHORIZED_V2_LIVE_EXECUTABLE_MODULES: readonly string[];

export function computeSha256(content: string | Buffer): string;
export function validateAuthorizedV2LiveManifestData(manifest: {
  version?: string | undefined;
  executableModules?: string[] | undefined;
}): void;

export interface AuthorizedV2LiveFreezeResult {
  freezeMethodVersion: string;
  runtimeFileCount: number;
  runtimeFileSet: string[];
  perFileSha256: Record<string, string>;
  executableAggregateSha256: string;
  sourceHead: string;
}

export function computeAuthorizedV2LiveFreeze(options?: {
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
}): AuthorizedV2LiveFreezeResult;
