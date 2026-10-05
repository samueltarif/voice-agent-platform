export const MAX_V2_TYPESAFE_REQUESTS: number;
export const MAX_V2_OPENAI_REQUESTS: number;
export const V2_TOTAL_MAX_PROVIDER_REQUESTS: number;
export const V2_CONCURRENCY: number;
export const V2_RETRIES: number;
export const EXPECTED_V2_DATASET_SHA256: string;
export const EXPECTED_V2_CASE_COUNT: number;
export const V2_RESEARCH_HARNESS_TIMEOUT_MS: number;
export const V2_DEFAULT_OPENAI_MODEL: string;
export const V2_LIVE_AUTHORIZED: boolean;

export function computeV2Sha256(content: string): string;
export function checkV2Caps(
  state: {
    totalProviderRequestsAttempted: number;
    typeSafeRequestsAttempted: number;
    openAiRequestsAttempted: number;
  },
  targetProvider: 'TYPESAFE' | 'OPENAI',
): string | null;

export interface V2DatasetCase {
  id: string;
  description: string;
  callerTranscript: string;
  expectedMatcherMatched: boolean;
  expectedCapabilityRelevant: boolean;
  expectedExactlyAnswerable: boolean;
  expectedResidualSemanticWork?: string | boolean | undefined;
  expectedJevOutcome?: string | undefined;
}

export interface V2CaseEvidence {
  schemaVersion: string;
  caseId: string;
  matcherMatched: boolean;
  capabilityRelevant: boolean;
  exactlyAnswerable: boolean;
  jevEvaluated: boolean;
  jevProviderModel: string | null;
  policyOutcome: string | null;
  openAiInvoked: boolean;
  completionObserved: boolean;
  securityEscalated: boolean;
  deterministicDispatchAttempted: boolean;
  deterministicHandled: boolean;
  deterministicDeclineFallback: boolean;
  criterionAV2Pass: boolean;
  technicalStatus: string;
  errorCategory: string | null;
}

export interface V2RunState {
  typeSafeRequestsAttempted: number;
  typeSafeRequestsSucceeded: number;
  openAiRequestsAttempted: number;
  openAiRequestsSucceeded: number;
  totalProviderRequestsAttempted: number;
  matcherTrueCount: number;
  matcherFalseCount: number;
  capabilityRelevantTrue: number;
  capabilityRelevantFalse: number;
  exactlyAnswerableTrue: number;
  exactlyAnswerableFalse: number;
  jevEvaluatedCount: number;
  openAiInvokedCount: number;
  jointChainObservedCount: number;
  deterministicDeclineFallbackCount: number;
  securityBlockedCount: number;
  technicalFailures: number;
  timeouts: number;
  consecutiveFailures: number;
  criterionAV2PassObserved: boolean;
  typeSafeMismatch: boolean;
}

export interface V2ResultArtifact {
  metadata: {
    suite: string;
    version: string;
    schemaVersion: string;
    classification: string;
    executedAt: string;
    datasetPath: string;
    datasetSha256: string;
    datasetCaseCount: number;
    requestedTypeSafeModel: string;
    expectedTypeSafeModel: string;
    requestedOpenAiModel: string;
    openAiModelIdentityStatus: string;
    maxV2TypeSafeRequests: number;
    maxV2OpenAiRequests: number;
    totalMaxV2ProviderRequests: number;
    concurrency: number;
    retries: number;
    customerData: number;
    twilioCalls: number;
    projectedCostCeilingUsd: null;
    hardProviderBillingBound: string;
    liveCostCeiling: string;
  };
  aggregates: {
    caseEvaluations: number;
    matcherTrueCount: number;
    matcherFalseCount: number;
    capabilityRelevantTrue: number;
    capabilityRelevantFalse: number;
    exactlyAnswerableTrue: number;
    exactlyAnswerableFalse: number;
    jevEvaluatedCount: number;
    openAiInvokedCount: number;
    jointChainObservedCount: number;
    deterministicDeclineFallbackCount: number;
    securityBlockedCount: number;
    typeSafeRequestsAttempted: number;
    typeSafeRequestsSucceeded: number;
    openAiRequestsAttempted: number;
    openAiRequestsSucceeded: number;
    totalProviderRequestsAttempted: number;
    criterionAV2PassObserved: boolean;
    technicalFailures: number;
    timeouts: number;
  };
  cases: V2CaseEvidence[];
}

export interface V2BenchmarkOptions {
  offlineMode?: boolean | undefined;
  allowLiveExecution?: boolean | undefined;
  dryRunWrite?: boolean | undefined;
  datasetPath?: string | undefined;
  outPath?: string | undefined;
  timeoutMs?: number | undefined;
  openAiModelId?: string | undefined;
  typeSafeApiKey?: string | undefined;
  openAiApiKey?: string | undefined;
  fakeTypeSafeFetch?: ((url: string, init?: RequestInit) => Promise<unknown>) | undefined;
  fakeOpenAiFetch?: ((url: string, init?: RequestInit) => Promise<unknown>) | undefined;
  fetchFn?: ((url: string, init?: RequestInit) => Promise<unknown>) | undefined;
  deps?: unknown;
  typeSafeAdapter?: unknown;
  openAiAdapter?: unknown;
  logger?:
    | {
        log: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
      }
    | undefined;
  customEnv?: Record<string, string | undefined> | undefined;
}

export function createV2InitialState(): V2RunState;
export function evaluateCriterionAV2(evidence: V2CaseEvidence): boolean;
export function classifyV2RunResult(params: {
  casesEvaluated: number;
  totalExpected: number;
  technicalFailures: number;
  timeouts: number;
  typeSafeMismatch: boolean;
  stoppedEarly: boolean;
  criterionPassObserved: boolean;
}): string;
export function executeMixedIntentV2Case(params: {
  caseData: V2DatasetCase;
  deps: unknown;
  typeSafeAdapter: {
    evaluateTurn: (input: { callerTranscript: string }) => Promise<{
      securityScore: number;
      deterministicScore: number;
      generativeScore: number;
      providerModel: string;
      latencyMs?: number | undefined;
    }>;
  };
  openAiAdapter: {
    streamTurn: (input: {
      messages: Array<{ role: string; content: string }>;
    }) => Promise<AsyncIterable<{ type?: string | undefined; error?: string | undefined }>>;
  };
  state: V2RunState;
  logger?: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void } | undefined;
  timeoutMs: number;
  openAiModelId?: string | undefined;
}): Promise<{ evidence: V2CaseEvidence; shouldStop: boolean }>;
export function parseV2CliArgs(customArgs?: string[]): {
  allowLiveExecution: boolean;
  offlineMode: boolean;
  dryRunWrite: boolean;
  datasetPath: string | undefined;
  outPath: string | undefined;
};
export function validateV2Dataset(options: V2BenchmarkOptions): {
  datasetPath: string;
  datasetSha256: string;
  cases: V2DatasetCase[];
};
export function runMixedIntentV2Benchmark(options?: V2BenchmarkOptions): Promise<V2ResultArtifact>;
export function executeV2Cli(
  args?: string[],
  customLogger?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  },
): Promise<number>;
