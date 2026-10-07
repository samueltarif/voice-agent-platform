export interface TargetedV2TechnicalReadinessResult {
  envSourceReady: boolean;
  datasetFreezeMatch: boolean;
  liveExecutableFreezeMatch: boolean;
  studyConfigurationMatch: boolean;
  technicalPrerequisitesReady: boolean;
  liveAuthorizationEvaluated: false;
  liveAuthorizationGrantedByThisTool: false;
}

export interface TargetedV2TechnicalReadinessOptions {
  envFilePath: string;
  customEnv?: NodeJS.ProcessEnv;
  datasetPath?: string;
  overrideDatasetSha256?: string;
  overrideLiveExecutableFreezeSha256?: string;
  overrideStudyConfig?: Record<string, unknown>;
  liveFreezeOptions?: Record<string, unknown>;
}

export declare function parseTechnicalReadinessCliArgs(args?: string[]): { envFilePath: string };
export declare function checkTargetedV2TechnicalReadiness(
  options: TargetedV2TechnicalReadinessOptions,
): Promise<TargetedV2TechnicalReadinessResult>;
export declare function formatTechnicalReadinessReport(
  result: TargetedV2TechnicalReadinessResult,
): string;
