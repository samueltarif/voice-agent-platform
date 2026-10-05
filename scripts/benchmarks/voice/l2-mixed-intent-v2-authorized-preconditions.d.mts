export const AUTHORIZED_V2_STUDY_ID: string;
export const AUTHORIZED_V2_DATASET_PATH: string;
export const AUTHORIZED_V2_DATASET_SHA256: string;
export const AUTHORIZED_V2_OFFLINE_FREEZE_SHA256: string;
export const AUTHORIZED_V2_TYPESAFE_MODEL: string;
export const AUTHORIZED_V2_OPENAI_MODEL: string;
export const AUTHORIZED_OPERATOR_COST_CEILING_USD: number;
export const EXPECTED_AUTHORIZED_V2_LIVE_MODULE_COUNT: number;
export const V2_LIVE_TYPESAFE_PLANNING_INPUT_TOKENS_PER_REQ: number;
export const V2_LIVE_OPENAI_PLANNING_INPUT_TOKENS_PER_REQ: number;
export const V2_LIVE_OPENAI_PLANNING_OUTPUT_TOKENS_PER_REQ: number;
export const V2_LIVE_TYPESAFE_PLANNING_RATE_USD_PER_BTOK: number;
export const V2_LIVE_OPENAI_PLANNING_RATE_USD_PER_MTOK_INPUT: number;
export const V2_LIVE_OPENAI_PLANNING_RATE_USD_PER_MTOK_OUTPUT: number;

export function computeV2LivePlanningEstimateUsd(): number;

export interface AuthorizedV2Authorization {
  studyId?: string | undefined;
  granted?: boolean | undefined;
  consumed?: boolean | undefined;
}

export interface AuthorizedV2LivePreconditions {
  datasetPath: string;
  datasetSha256: string;
  cases: unknown[];
  offlineFreezeSha256: string;
  liveFreezeSha256: string;
  liveFreezeModuleCount: number;
  planningEstimateUsd: number;
  ceilingUsd: number;
  authorizationConsumed: boolean;
}

export function validateAuthorizedLivePreconditions(options?: {
  allowLiveExecution?: boolean | undefined;
  authorization?: AuthorizedV2Authorization | undefined;
  costCeilingUsd?: number | undefined;
  acceptTypesafeEmpiricalPricing?: boolean | undefined;
  datasetPath?: string | undefined;
  customerData?: unknown | undefined;
  useHoldout?: unknown | undefined;
  useTwilio?: unknown | undefined;
  useStagingDb?: unknown | undefined;
  useProductionDb?: unknown | undefined;
  customerTraffic?: unknown | undefined;
  computeOfflineFreeze?: (() => { executableAggregateSha256: string }) | undefined;
  computeLiveFreeze?:
    | ((args?: {
        manifest?: unknown | undefined;
        manifestPath?: string | undefined;
        readBytes?: ((modPath: string) => Buffer) | undefined;
        repoRoot?: string | undefined;
        ref?: string | undefined;
      }) => { executableAggregateSha256: string; runtimeFileCount: number })
    | undefined;
  manifest?: unknown | undefined;
  manifestPath?: string | undefined;
  readBytes?: ((modPath: string) => Buffer) | undefined;
  repoRoot?: string | undefined;
  ref?: string | undefined;
}): AuthorizedV2LivePreconditions;
