declare module '../../../../scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs' {
  export const EXPECTED_DATASET_SHA256: string;
  export const EXPECTED_CASE_COUNT: number;
  export const REQUESTED_TYPESAFE_MODEL: string;
  export const EXPECTED_TYPESAFE_MODEL: string;
  export const DEFAULT_OPENAI_MODEL: string;
  export const MAX_TYPESAFE_REQUESTS: number;
  export const MAX_OPENAI_REQUESTS: number;
  export const TOTAL_MAX_PROVIDER_REQUESTS: number;
  export const CONCURRENCY: number;
  export const RETRIES: number;
  export const RESEARCH_HARNESS_TIMEOUT_MS: number;
  export const TYPESAFE_PRICE_PER_BTOK: number;
  export const MAX_TYPESAFE_INPUT_TOKENS_PER_REQ: number;
  export const TYPESAFE_HISTORICAL_PROJECTED_COST_USD: number;
  export const MAX_PROJECTED_TYPESAFE_COST_USD: number;
  export const OPENAI_PRICE_STATUS: string;
  export const PROPOSED_COST_CEILING_USD: number;

  export class OfflineNetworkDeniedError extends Error {}

  export function computeSha256(content: string): string;
  export function createDenyNetworkFetch(): (url: string, init?: RequestInit) => Promise<never>;
  export function parseCostCeiling(
    customArgs?: string[],
    customEnv?: Record<string, string | undefined>,
  ): number;
  export function classifyTypeSafeError(
    err: unknown,
    isTimedOut: boolean,
  ): { status: string; errorCategory: string };
  export function classifyOpenAiError(
    err: unknown,
    isTimedOut: boolean,
  ): { status: string; errorCategory: string };

  export interface L2BenchmarkOptions {
    offlineMode?: boolean;
    allowLiveExecution?: boolean;
    costCeilingUsd?: number;
    datasetPath?: string;
    outPath?: string;
    dryRunWrite?: boolean;
    timeoutMs?: number;
    typeSafeApiKey?: string;
    openAiApiKey?: string;
    openAiModelId?: string;
    fakeTypeSafeFetch?: (
      url: string,
      init?: RequestInit,
    ) => Promise<Response | { ok: boolean; status: number; json: () => Promise<unknown> }>;
    fakeOpenAiFetch?: (
      url: string,
      init?: RequestInit,
    ) => Promise<Response | { ok: boolean; status: number; body: unknown }>;
    fetchFn?: (url: string, init?: RequestInit) => Promise<unknown>;
    deps?: unknown;
    logger?: {
      log: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    };
    customArgs?: string[];
    customEnv?: Record<string, string | undefined>;
  }

  export interface L2CaseResult {
    caseId: string;
    intendedStimulusClass: string;
    matcherMatched: boolean;
    jevCalled: boolean;
    jevProviderModel: string | null;
    observedRoute: string;
    openAiCalled: boolean;
    openAiRequestedModel: string | null;
    openAiObservedModel: string | null;
    technicalStatus: string;
    jevLatencyMs: number | null;
    openAiLatencyMs: number | null;
    errorCategory: string | null;
  }

  export interface L2ResultArtifact {
    metadata: {
      suite: string;
      version: string;
      classification: string;
      executedAt: string;
      datasetPath: string;
      datasetSha256: string;
      datasetCaseCount: number;
      requestedTypeSafeModel: string;
      expectedTypeSafeModel: string;
      requestedOpenAiModel: string;
      openAiModelIdentityStatus: string;
      maxTypeSafeRequests: number;
      maxOpenAiRequests: number;
      totalMaxProviderRequests: number;
      concurrency: number;
      retries: number;
      customerData: number;
      twilioCalls: number;
      projectedCostCeilingUsd: number;
      pricePerBtokTypeSafe: number;
      openAiPriceStatus: string;
    };
    aggregates: {
      matcherEvaluations: number;
      matcherMatchedCount: number;
      matcherUnmatchedCount: number;
      typeSafeRequestsAttempted: number;
      typeSafeRequestsSucceeded: number;
      openAiRequestsAttempted: number;
      openAiRequestsSucceeded: number;
      totalProviderRequestsAttempted: number;
      deterministicCount: number;
      generativeCount: number;
      securityBlockedCount: number;
      coreJointChainObserved: boolean;
      technicalFailures: number;
      timeouts: number;
      estimatedUpperBoundCostUsd: number;
    };
    cases: L2CaseResult[];
  }

  export function runL2Benchmark(options?: L2BenchmarkOptions): Promise<L2ResultArtifact>;
}
