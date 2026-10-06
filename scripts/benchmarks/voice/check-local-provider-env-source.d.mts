export interface PreflightCliOptions {
  envFilePath: string;
}

export interface ProviderEnvPreflightResult {
  envFileExists: boolean;
  typeSafeCredentialPresent: boolean;
  openAiCredentialPresent: boolean;
  sanitizedChildSourceReady: boolean;
}

export function parsePreflightCliArgs(args?: string[]): PreflightCliOptions;

export function checkLocalProviderEnvSource(options: {
  envFilePath: string;
  spawnFn?: typeof import('node:child_process').spawnSync;
  customEnv?: NodeJS.ProcessEnv;
}): Promise<ProviderEnvPreflightResult>;

export function formatPreflightReport(result: ProviderEnvPreflightResult): string;
