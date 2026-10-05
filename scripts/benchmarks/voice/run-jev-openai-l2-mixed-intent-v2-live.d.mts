import type { V2CaseEvidence } from './run-jev-openai-l2-mixed-intent-v2.mjs';

export function parseAuthorizedV2CliArgs(customArgs?: string[]): {
  allowLiveExecution: boolean;
  acceptTypesafeEmpiricalPricing: boolean;
  costCeilingUsd: number | undefined;
  datasetPath: string | undefined;
  outPath: string | undefined;
  dryRunWrite: boolean;
};

export interface AuthorizedV2StudyArtifact {
  metadata: Record<string, unknown>;
  aggregates: Record<string, unknown>;
  cases: V2CaseEvidence[];
}

export function runAuthorizedV2Study(options?: {
  allowLiveExecution?: boolean | undefined;
  authorization?:
    | {
        studyId?: string | undefined;
        granted?: boolean | undefined;
        consumed?: boolean | undefined;
      }
    | undefined;
  costCeilingUsd?: number | undefined;
  acceptTypesafeEmpiricalPricing?: boolean | undefined;
  datasetPath?: string | undefined;
  outPath?: string | undefined;
  dryRunWrite?: boolean | undefined;
  logger?:
    | {
        log: (...args: unknown[]) => void;
        warn?: (...args: unknown[]) => void;
        error?: (...args: unknown[]) => void;
      }
    | undefined;
  deps?: unknown | undefined;
  typeSafeAdapter?: unknown | undefined;
  openAiAdapter?: unknown | undefined;
  useRealAdapters?: boolean | undefined;
  typeSafeApiKey?: string | undefined;
  openAiApiKey?: string | undefined;
  timeoutMs?: number | undefined;
  openAiModelId?: string | undefined;
  customerData?: unknown | undefined;
  useHoldout?: unknown | undefined;
  useTwilio?: unknown | undefined;
  useStagingDb?: unknown | undefined;
  useProductionDb?: unknown | undefined;
  customerTraffic?: unknown | undefined;
  computeOfflineFreeze?: (() => { executableAggregateSha256: string }) | undefined;
  computeLiveFreeze?:
    | ((args?: Record<string, unknown>) => {
        executableAggregateSha256: string;
        runtimeFileCount: number;
      })
    | undefined;
  manifest?: unknown | undefined;
  manifestPath?: string | undefined;
  readBytes?: ((modPath: string) => Buffer) | undefined;
  repoRoot?: string | undefined;
  ref?: string | undefined;
}): Promise<AuthorizedV2StudyArtifact>;

export function executeAuthorizedV2Cli(args?: string[], customLogger?: unknown): Promise<number>;
