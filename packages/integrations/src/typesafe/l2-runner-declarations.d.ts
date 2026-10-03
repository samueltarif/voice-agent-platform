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
  export const TYPESAFE_EMPIRICAL_RATE_PER_BTOK: number;
  export const MAX_TYPESAFE_INPUT_TOKENS_PER_REQ: number;
  export const TYPESAFE_HISTORICAL_PROJECTED_COST_USD: number;
  export const MAX_PROJECTED_TYPESAFE_COST_USD: number;
  export const TYPESAFE_PRICE_STATUS: string;
  export const TYPESAFE_PRICING_EVIDENCE: string;
  export const OPENAI_PRICE_STATUS: string;
  export const PROPOSED_COST_CEILING_USD: number;
  export const L2_PLANNING_TOTAL_PROVIDER_COST_USD: number;
  export const HARD_L2_COST_BOUND_FEASIBLE: string;
  export const MAX_TYPESAFE_INPUT_CHARS_PER_REQ: number;
  export const MAX_OPENAI_INPUT_CHARS_PER_REQ: number;
  export const RUNTIME_ENFORCED_INPUT_TOKEN_CAP: string;
  export const TOKEN_CAP_ENFORCEMENT: string;

  export class OfflineNetworkDeniedError extends Error {}
  export class InputBudgetExceededError extends Error {}

  export function computeSha256(content: string): string;
  export function createDenyNetworkFetch(): (url: string, init?: RequestInit) => Promise<never>;
  export function parseCliArgs(customArgs?: string[]): L2BenchmarkOptions;
  export function parseCostCeiling(
    customArgs?: string[],
    customEnv?: Record<string, string | undefined>,
  ): number;
  export function validateTypeSafePreauth(params?: {
    acceptTypesafeEmpiricalPricing?: boolean | undefined;
    priceStatus?: string | undefined;
    pricingEvidence?: string | undefined;
    empiricalRatePerBtok?: number | undefined;
    approvedCostCeilingUsd?: number | undefined;
  }): void;
  export function validateTypeSafeInputBudget(callerTranscript: string): void;
  export function validateOpenAiInputBudget(
    messages: Array<{ role: string; content?: string }>,
  ): void;
  export function checkCaps(
    state: {
      totalProviderRequestsAttempted: number;
      typeSafeRequestsAttempted: number;
      openAiRequestsAttempted: number;
    },
    targetProvider: 'TYPESAFE' | 'OPENAI',
  ): string | null;
  export function classifyTypeSafeError(
    err: unknown,
    isTimedOut: boolean,
  ): { status: string; errorCategory: string };
  export function classifyOpenAiError(
    err: unknown,
    isTimedOut: boolean,
  ): { status: string; errorCategory: string };

  export interface L2BenchmarkOptions {
    offlineMode?: boolean | undefined;
    allowLiveExecution?: boolean | undefined;
    acceptTypesafeEmpiricalPricing?: boolean | undefined;
    typeSafePriceStatus?: string | undefined;
    typeSafePricingEvidence?: string | undefined;
    typeSafeEmpiricalRatePerBtok?: number | undefined;
    costCeilingUsd?: number | undefined;
    datasetPath?: string | undefined;
    outPath?: string | undefined;
    dryRunWrite?: boolean | undefined;
    timeoutMs?: number | undefined;
    typeSafeApiKey?: string | undefined;
    openAiApiKey?: string | undefined;
    openAiModelId?: string | undefined;
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
    customArgs?: string[] | undefined;
    customEnv?: Record<string, string | undefined> | undefined;
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
      runtimeEnforcedInputTokenCap?: string | undefined;
      tokenCapEnforcement?: string | undefined;
      maxTypeSafeInputChars?: number | undefined;
      maxOpenAiInputChars?: number | undefined;
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

  export interface TypeSafeTurnEvaluationResult {
    output: unknown;
    errorResult: {
      technicalStatus: string;
      errorCategory: string;
      shouldStop: boolean;
      latencyMs: number | null;
      observedModel: string | null;
    } | null;
    latencyMs: number;
    observedModel: string | null;
  }

  export interface OpenAiTurnExecutionResult {
    technicalStatus: string;
    errorCategory: string | null;
    shouldStop: boolean;
    latencyMs: number | null;
  }

  export function runL2Benchmark(options?: L2BenchmarkOptions): Promise<L2ResultArtifact>;
  export function executeCli(
    args?: string[],
    env?: Record<string, string | undefined>,
    customLogger?: {
      log: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    },
  ): Promise<number>;
  export function evaluateTypeSafeJev(params: {
    typeSafeAdapter: { evaluateTurn: (...args: unknown[]) => Promise<unknown> };
    caseData: { caseId: string; syntheticCallerUtterance: string };
    state: {
      typeSafeRequestsAttempted: number;
      typeSafeRequestsSucceeded: number;
      openAiRequestsAttempted: number;
      openAiRequestsSucceeded: number;
      totalProviderRequestsAttempted: number;
      technicalFailures: number;
      timeouts: number;
      consecutiveFailures: number;
      typeSafeMismatch: boolean;
    };
    deps: unknown;
    logger: { error: (...args: unknown[]) => void };
    timeoutMs: number;
  }): Promise<TypeSafeTurnEvaluationResult>;
  export function executeOpenAiTurn(params: {
    openAiAdapter: { streamTurn: (...args: unknown[]) => Promise<unknown> };
    caseData: { caseId: string; syntheticCallerUtterance: string };
    state: {
      typeSafeRequestsAttempted: number;
      typeSafeRequestsSucceeded: number;
      openAiRequestsAttempted: number;
      openAiRequestsSucceeded: number;
      totalProviderRequestsAttempted: number;
      technicalFailures: number;
      timeouts: number;
      consecutiveFailures: number;
      generativeCount?: number;
    };
    logger: { error: (...args: unknown[]) => void };
    timeoutMs: number;
  }): Promise<OpenAiTurnExecutionResult>;
}
