import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkLocalProviderEnvSource } from './check-local-provider-env-source.mjs';
import { computeAuthorizedV2LiveFreeze } from './compute-l2-mixed-intent-v2-live-executable-freeze.mjs';

export const CANONICAL_V2_DATASET_PATH =
  'scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json';
export const CANONICAL_V2_DATASET_SHA256 =
  'ade86008b360b90754e2ac95a560d381e7adc655ecb20d09f2a28077faf9c690';
export const CANONICAL_V2_LIVE_FREEZE_SHA256 =
  'abdece3b7d4350987b9731b8f75948bcac17b5bcf7ab821b5347fa06fbe17db7';

export const CANONICAL_V2_STUDY_CONFIG = Object.freeze({
  typeSafeModel: 'jev-1.13.0',
  openAiModel: 'gpt-6-astra',
  typeSafeRequestCap: 4,
  openAiRequestCap: 4,
  totalRequestCap: 8,
  concurrency: 1,
  retries: 0,
  openAiMaxCompletionTokens: 500,
  providerTimeoutMs: 5000,
});

export function parseTechnicalReadinessCliArgs(args = []) {
  let envFilePath = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--env-file' && args[i + 1]) {
      envFilePath = args[++i];
    } else if (arg.startsWith('--env-file=')) {
      envFilePath = arg.slice('--env-file='.length);
    } else {
      throw new Error(`UNRECOGNIZED_PREFLIGHT_ARGUMENT: ${arg}`);
    }
  }
  if (!envFilePath) {
    throw new Error('MISSING_ENV_FILE_ARGUMENT: --env-file <path> is mandatory.');
  }
  return { envFilePath };
}

function verifyDatasetIntegrity(options = {}) {
  if (options.overrideDatasetSha256) {
    return options.overrideDatasetSha256 === CANONICAL_V2_DATASET_SHA256;
  }
  const datasetPath = resolve(options.datasetPath ?? CANONICAL_V2_DATASET_PATH);
  if (!existsSync(datasetPath)) {
    return false;
  }
  const raw = readFileSync(datasetPath, 'utf8');
  const actualSha = createHash('sha256').update(raw).digest('hex');
  return actualSha === CANONICAL_V2_DATASET_SHA256;
}

function verifyLiveExecutableFreeze(options = {}) {
  if (options.overrideLiveExecutableFreezeSha256) {
    return options.overrideLiveExecutableFreezeSha256 === CANONICAL_V2_LIVE_FREEZE_SHA256;
  }
  try {
    const liveFreeze = computeAuthorizedV2LiveFreeze(options.liveFreezeOptions);
    return liveFreeze.executableAggregateSha256 === CANONICAL_V2_LIVE_FREEZE_SHA256;
  } catch {
    return false;
  }
}

function verifyStudyConfiguration(options = {}) {
  const config = { ...CANONICAL_V2_STUDY_CONFIG, ...options.overrideStudyConfig };
  return (
    config.typeSafeModel === 'jev-1.13.0' &&
    config.openAiModel === 'gpt-6-astra' &&
    config.typeSafeRequestCap === 4 &&
    config.openAiRequestCap === 4 &&
    config.totalRequestCap === 8 &&
    config.concurrency === 1 &&
    config.retries === 0 &&
    config.openAiMaxCompletionTokens === 500 &&
    config.providerTimeoutMs === 5000
  );
}

export async function checkTargetedV2TechnicalReadiness(options = {}) {
  const { envFilePath } = options;
  const envCheck = await checkLocalProviderEnvSource({
    envFilePath,
    customEnv: options.customEnv,
  });

  const envSourceReady = Boolean(envCheck.sanitizedChildSourceReady);
  const datasetFreezeMatch = verifyDatasetIntegrity(options);
  const liveExecutableFreezeMatch = verifyLiveExecutableFreeze(options);
  const studyConfigurationMatch = verifyStudyConfiguration(options);

  const technicalPrerequisitesReady =
    envSourceReady && datasetFreezeMatch && liveExecutableFreezeMatch && studyConfigurationMatch;

  return {
    envSourceReady,
    datasetFreezeMatch,
    liveExecutableFreezeMatch,
    studyConfigurationMatch,
    technicalPrerequisitesReady,
    liveAuthorizationEvaluated: false,
    liveAuthorizationGrantedByThisTool: false,
  };
}

export function formatTechnicalReadinessReport(result) {
  return [
    `ENV_SOURCE_READY = ${result.envSourceReady ? 'YES' : 'NO'}`,
    `DATASET_FREEZE_MATCH = ${result.datasetFreezeMatch ? 'YES' : 'NO'}`,
    `LIVE_EXECUTABLE_FREEZE_MATCH = ${result.liveExecutableFreezeMatch ? 'YES' : 'NO'}`,
    `STUDY_CONFIGURATION_MATCH = ${result.studyConfigurationMatch ? 'YES' : 'NO'}`,
    `TECHNICAL_PREREQUISITES_READY = ${result.technicalPrerequisitesReady ? 'YES' : 'NO'}`,
    `LIVE_AUTHORIZATION_EVALUATED = NO`,
    `LIVE_AUTHORIZATION_GRANTED_BY_THIS_TOOL = NO`,
  ].join('\n');
}

async function main() {
  const { envFilePath } = parseTechnicalReadinessCliArgs(process.argv.slice(2));
  const result = await checkTargetedV2TechnicalReadiness({ envFilePath });
  console.log(formatTechnicalReadinessReport(result));
  process.exitCode = result.technicalPrerequisitesReady ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`TECHNICAL_READINESS_ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}
