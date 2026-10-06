import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SANITIZED_PROVIDER_ENV_KEYS = ['TYPESAFE_API_KEY', 'OPENAI_API_KEY'];

export function parsePreflightCliArgs(args = []) {
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

function createSanitizedParentEnv(sourceEnv) {
  const sanitized = { ...sourceEnv };
  for (const key of SANITIZED_PROVIDER_ENV_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

export async function checkLocalProviderEnvSource({ envFilePath, spawnFn = spawnSync, customEnv }) {
  const targetPath = resolve(envFilePath);
  if (!existsSync(targetPath)) {
    return {
      envFileExists: false,
      typeSafeCredentialPresent: false,
      openAiCredentialPresent: false,
      sanitizedChildSourceReady: false,
    };
  }

  const sanitizedEnv = createSanitizedParentEnv(customEnv ?? process.env);
  const probeScript =
    'const ts = Boolean(process.env.TYPESAFE_API_KEY && process.env.TYPESAFE_API_KEY.trim().length > 0);' +
    'const oa = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);' +
    'process.stdout.write(JSON.stringify({ ts, oa }));';

  const child = spawnFn(process.execPath, ['--env-file', targetPath, '-e', probeScript], {
    env: sanitizedEnv,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (child.error || child.status !== 0) {
    return {
      envFileExists: true,
      typeSafeCredentialPresent: false,
      openAiCredentialPresent: false,
      sanitizedChildSourceReady: false,
    };
  }

  try {
    const parsed = JSON.parse(child.stdout || '{}');
    const typeSafeCredentialPresent = Boolean(parsed.ts);
    const openAiCredentialPresent = Boolean(parsed.oa);
    return {
      envFileExists: true,
      typeSafeCredentialPresent,
      openAiCredentialPresent,
      sanitizedChildSourceReady: typeSafeCredentialPresent && openAiCredentialPresent,
    };
  } catch {
    return {
      envFileExists: true,
      typeSafeCredentialPresent: false,
      openAiCredentialPresent: false,
      sanitizedChildSourceReady: false,
    };
  }
}

export function formatPreflightReport(result) {
  return [
    `ENV_FILE_EXISTS = ${result.envFileExists ? 'YES' : 'NO'}`,
    `TYPESAFE_CREDENTIAL_PRESENT = ${result.typeSafeCredentialPresent ? 'YES' : 'NO'}`,
    `OPENAI_CREDENTIAL_PRESENT = ${result.openAiCredentialPresent ? 'YES' : 'NO'}`,
    `SANITIZED_CHILD_SOURCE_READY = ${result.sanitizedChildSourceReady ? 'YES' : 'NO'}`,
  ].join('\n');
}

async function main() {
  const { envFilePath } = parsePreflightCliArgs(process.argv.slice(2));
  const result = await checkLocalProviderEnvSource({ envFilePath });
  console.log(formatPreflightReport(result));
  process.exitCode = result.sanitizedChildSourceReady ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`PREFLIGHT_ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}
