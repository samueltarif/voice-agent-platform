import { TWILIO_SIP_REGIONS } from '../twilio-outbound/twilio-outbound-config.js';
import { MILLIS_REGION_BASE_URLS } from '../millis/millis-config.js';

/**
 * 008-OF6 — Leitura VALUE-BLIND do ambiente da primeira chamada real.
 * Devolve só presença e conformidade de formato (nunca valor, prefixo,
 * tamanho ou hash). Não lê arquivos `.env`, não acessa rede e não abre banco.
 */
export const LIVE_TEST_ENV = {
  appEnv: 'APP_ENV',
  liveTestEnabled: 'LIVE_TEST_ENABLED',
  killSwitch: 'LIVE_TEST_KILL_SWITCH',
  twilioAccountSid: 'TWILIO_ACCOUNT_SID',
  twilioApiKeySid: 'TWILIO_API_KEY_SID',
  twilioApiKeySecret: 'TWILIO_API_KEY_SECRET',
  twilioAuthToken: 'TWILIO_AUTH_TOKEN',
  twilioCallerId: 'TWILIO_CALLER_ID',
  twilioSipRegion: 'TWILIO_SIP_REGION',
  callbackBaseUrl: 'LIVE_TEST_CALLBACK_BASE_URL',
  millisApiKey: 'MILLIS_API_KEY',
  millisRegion: 'MILLIS_REGION',
  destination: 'LIVE_TEST_DESTINATION',
  maxDurationSeconds: 'LIVE_TEST_MAX_DURATION_SECONDS',
  budgetCapMinorUnits: 'LIVE_TEST_BUDGET_CAP_MINOR_UNITS',
  maxConcurrency: 'LIVE_TEST_MAX_CONCURRENCY',
  databaseUrl: 'DATABASE_URL',
  expectedDatabaseHost: 'LIVE_TEST_EXPECTED_DB_HOST',
  authorizationRef: 'LIVE_TEST_AUTHORIZATION_REF',
  attestations: 'LIVE_TEST_OPERATOR_ATTESTATIONS',
} as const;

export const OPERATOR_ATTESTATIONS = [
  'twilio_number_and_regulatory_bundle_approved',
  'destination_owned_by_operator',
  'budget_cap_approved',
  'legal_and_regulatory_review_done',
  'staging_tls_fqdn_verified',
  'single_call_authorized',
] as const;
export type OperatorAttestation = (typeof OPERATOR_ATTESTATIONS)[number];

export type FormatCheck = 'OK' | 'ABSENT' | 'INVALID';

export interface LiveTestEnvironmentFacts {
  readonly formats: Readonly<Record<keyof typeof LIVE_TEST_ENV, FormatCheck>>;
  readonly isStaging: boolean;
  readonly liveTestEnabled: boolean;
  readonly killSwitchReleased: boolean;
  readonly databaseHostMatches: boolean;
  readonly attested: ReadonlySet<OperatorAttestation>;
}

type Env = Readonly<Record<string, string | undefined>>;

const E164 = /^\+[1-9]\d{7,14}$/;
const POSITIVE_INT = /^[1-9]\d{0,6}$/;
const VALIDATORS: Readonly<Record<keyof typeof LIVE_TEST_ENV, (v: string) => boolean>> = {
  appEnv: (v) => /^[a-z]+$/.test(v),
  liveTestEnabled: (v) => v === 'true' || v === 'false',
  killSwitch: (v) => v === 'engaged' || v === 'released',
  twilioAccountSid: (v) => /^AC[0-9a-f]{32}$/.test(v),
  twilioApiKeySid: (v) => /^SK[0-9a-f]{32}$/.test(v),
  twilioApiKeySecret: (v) => v.length >= 16,
  twilioAuthToken: (v) => /^[0-9a-f]{32}$/.test(v),
  twilioCallerId: (v) => E164.test(v) && v.startsWith('+55'),
  twilioSipRegion: (v) => (TWILIO_SIP_REGIONS as readonly string[]).includes(v),
  callbackBaseUrl: (v) =>
    /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-])?$/.test(v),
  millisApiKey: (v) => /^[A-Za-z0-9._-]{16,256}$/.test(v),
  millisRegion: (v) => Object.hasOwn(MILLIS_REGION_BASE_URLS, v),
  destination: (v) => E164.test(v) && v.startsWith('+55'),
  maxDurationSeconds: (v) => POSITIVE_INT.test(v) && Number(v) >= 30 && Number(v) <= 600,
  budgetCapMinorUnits: (v) => POSITIVE_INT.test(v),
  maxConcurrency: (v) => v === '1',
  databaseUrl: (v) => /^postgres(ql)?:\/\//.test(v),
  expectedDatabaseHost: (v) => /^[a-z0-9.-]+$/.test(v),
  authorizationRef: (v) => /^DEC-\d{3,4}$/.test(v),
  attestations: (v) =>
    v
      .split(',')
      .every((item) => (OPERATOR_ATTESTATIONS as readonly string[]).includes(item.trim())),
};

function check(env: Env, key: keyof typeof LIVE_TEST_ENV): FormatCheck {
  const value = env[LIVE_TEST_ENV[key]];
  if (value === undefined || value.trim() === '') return 'ABSENT';
  return VALIDATORS[key](value.trim()) ? 'OK' : 'INVALID';
}

function databaseHost(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

export function readLiveTestEnvironment(env: Env): LiveTestEnvironmentFacts {
  const keys = Object.keys(LIVE_TEST_ENV) as Array<keyof typeof LIVE_TEST_ENV>;
  const formats = Object.fromEntries(keys.map((key) => [key, check(env, key)])) as Record<
    keyof typeof LIVE_TEST_ENV,
    FormatCheck
  >;
  const host = databaseHost(env[LIVE_TEST_ENV.databaseUrl]);
  const expected = env[LIVE_TEST_ENV.expectedDatabaseHost]?.trim();
  const attested =
    formats.attestations === 'OK'
      ? env[LIVE_TEST_ENV.attestations]!.split(',').map((i) => i.trim())
      : [];
  return {
    formats,
    isStaging: env[LIVE_TEST_ENV.appEnv] === 'staging',
    liveTestEnabled: env[LIVE_TEST_ENV.liveTestEnabled] === 'true',
    killSwitchReleased: env[LIVE_TEST_ENV.killSwitch] === 'released',
    databaseHostMatches: Boolean(
      host && expected && host === expected && !['localhost', '127.0.0.1'].includes(host),
    ),
    attested: new Set(attested as OperatorAttestation[]),
  };
}
