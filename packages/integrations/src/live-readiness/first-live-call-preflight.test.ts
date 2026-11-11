import { describe, expect, it } from 'vitest';
import {
  LIVE_TEST_ENV,
  OPERATOR_ATTESTATIONS,
  readLiveTestEnvironment,
} from './first-live-call-environment.js';
import { evaluateFirstLiveCallPreflight } from './first-live-call-preflight.js';
import { CURRENT_REPOSITORY_TRUTH, type RepositoryTruth } from './first-live-call-blockers.js';

/** Estado HIPOTÉTICO (só para testar a regra): tudo confirmado e implementado. */
const HYPOTHETICAL_ALL_CONFIRMED: RepositoryTruth = {
  contracts: {
    twilioToMillisSipPlus55: 'CONFIRMED',
    millisRegisterSipCallResponse: 'CONFIRMED',
    millisSessionValidity: 'CONFIRMED',
    millisWebhookAuthentication: 'CONFIRMED',
  },
  platform: {
    durableSessionTokenLegPersistence: true,
    liveCompositionRoot: true,
    publicWebhookRoutesMounted: true,
  },
};

/** Valores SINTÉTICOS de formato válido (nenhuma credencial real). */
const SYNTHETIC_SECRET = 'synthetic-secret-value-0123456789';
const COMPLETE_ENV: Record<string, string> = {
  [LIVE_TEST_ENV.appEnv]: 'staging',
  [LIVE_TEST_ENV.liveTestEnabled]: 'true',
  [LIVE_TEST_ENV.killSwitch]: 'released',
  [LIVE_TEST_ENV.twilioAccountSid]: `AC${'1'.repeat(32)}`,
  [LIVE_TEST_ENV.twilioApiKeySid]: `SK${'2'.repeat(32)}`,
  [LIVE_TEST_ENV.twilioApiKeySecret]: SYNTHETIC_SECRET,
  [LIVE_TEST_ENV.twilioAuthToken]: '3'.repeat(32),
  [LIVE_TEST_ENV.twilioCallerId]: '+5511900000001',
  [LIVE_TEST_ENV.twilioSipRegion]: 'br1',
  [LIVE_TEST_ENV.callbackBaseUrl]: 'https://staging.example.test',
  [LIVE_TEST_ENV.millisApiKey]: 'millis-synthetic-key-0123456789',
  [LIVE_TEST_ENV.millisRegion]: 'us-west',
  [LIVE_TEST_ENV.destination]: '+5511900000002',
  [LIVE_TEST_ENV.maxDurationSeconds]: '180',
  [LIVE_TEST_ENV.budgetCapMinorUnits]: '500',
  [LIVE_TEST_ENV.maxConcurrency]: '1',
  [LIVE_TEST_ENV.databaseUrl]: 'postgresql://u:p@db.staging.example.test:5432/app',
  [LIVE_TEST_ENV.expectedDatabaseHost]: 'db.staging.example.test',
  [LIVE_TEST_ENV.authorizationRef]: 'DEC-099',
  [LIVE_TEST_ENV.attestations]: OPERATOR_ATTESTATIONS.join(','),
};

function report(env: Record<string, string | undefined>) {
  return evaluateFirstLiveCallPreflight(readLiveTestEnvironment(env));
}

describe('008-OF6 — first live call preflight (value-blind, no network)', () => {
  it('empty environment: BLOCKED, every operator item pending, never PROVIDER_VALIDATED', () => {
    const result = report({});
    expect(result.offline).toBe('OFFLINE_INTEGRATION_READY');
    expect(result.live).toBe('BLOCKED');
    expect(result.blockers).toHaveLength(9);
    expect(JSON.stringify(result)).not.toContain('PROVIDER_VALIDATED');
  });

  it('even a complete environment stays BLOCKED by provider contracts and missing runtime code', () => {
    const result = report(COMPLETE_ENV);
    expect(result.live).toBe('BLOCKED');
    const byId = Object.fromEntries(result.blockers.map((b) => [b.id.split('-')[0], b.status]));
    expect(byId).toEqual({
      '1': 'BLOCKED_PROVIDER',
      '2': 'PASS',
      '3': 'BLOCKED_PROVIDER',
      '4': 'BLOCKED_CODE',
      '5': 'PASS',
      '6': 'PASS',
      '7': 'BLOCKED_CODE',
      '8': 'PASS',
      '9': 'PASS',
    });
    expect(result.technical.filter((c) => c.status !== 'PASS').map((c) => c.id)).toEqual([
      'live-composition-root',
    ]);
  });

  it('never echoes secret, token, key or DSN values', () => {
    const serialized = JSON.stringify(report(COMPLETE_ENV));
    for (const value of [
      SYNTHETIC_SECRET,
      '3'.repeat(32),
      'millis-synthetic-key',
      'postgresql://',
      '+5511900000002',
      'AC1111',
    ]) {
      expect(serialized).not.toContain(value);
    }
  });

  it.each([
    [
      'local database',
      {
        [LIVE_TEST_ENV.databaseUrl]: 'postgresql://u:p@localhost:5432/app',
        [LIVE_TEST_ENV.expectedDatabaseHost]: 'localhost',
      },
      'database-target-confirmed',
    ],
    [
      'database host mismatch',
      { [LIVE_TEST_ENV.expectedDatabaseHost]: 'other.example.test' },
      'database-target-confirmed',
    ],
    ['not staging', { [LIVE_TEST_ENV.appEnv]: 'production' }, 'environment-is-staging'],
    [
      'kill switch engaged',
      { [LIVE_TEST_ENV.killSwitch]: 'engaged' },
      'kill-switch-released-by-operator',
    ],
    ['concurrency above one', { [LIVE_TEST_ENV.maxConcurrency]: '2' }, 'single-call-limits'],
    ['duration above 600 s', { [LIVE_TEST_ENV.maxDurationSeconds]: '601' }, 'single-call-limits'],
    [
      'malformed Twilio token',
      { [LIVE_TEST_ENV.twilioAuthToken]: 'abc' },
      'credentials-present-and-well-formed',
    ],
    ['unknown SIP region', { [LIVE_TEST_ENV.twilioSipRegion]: 'sa1' }, 'provider-regions-valid'],
    [
      'live test not explicitly enabled',
      { [LIVE_TEST_ENV.liveTestEnabled]: 'yes' },
      'live-test-explicitly-enabled',
    ],
  ])('%s fails its technical check', (_name, overrides, id) => {
    const failing = report({ ...COMPLETE_ENV, ...overrides }).technical.find((c) => c.id === id);
    expect(failing?.status).toBe('FAIL');
  });

  it('current repository truth keeps provider contracts unverified and runtime absent', () => {
    expect(Object.values(CURRENT_REPOSITORY_TRUTH.contracts)).not.toContain('CONFIRMED');
    expect(Object.values(CURRENT_REPOSITORY_TRUTH.platform)).not.toContain(true);
  });

  it('only when every blocker and technical check passes can it become ready', () => {
    const facts = readLiveTestEnvironment(COMPLETE_ENV);
    const ready = evaluateFirstLiveCallPreflight(facts, HYPOTHETICAL_ALL_CONFIRMED);
    expect(ready.live).toBe('READY_FOR_OPERATOR_CONTROLLED_PROVIDER_VALIDATION');
    for (const overrides of [
      { [LIVE_TEST_ENV.killSwitch]: 'engaged' },
      { [LIVE_TEST_ENV.maxConcurrency]: '3' },
      { [LIVE_TEST_ENV.appEnv]: 'development' },
    ]) {
      const failing = readLiveTestEnvironment({ ...COMPLETE_ENV, ...overrides });
      expect(evaluateFirstLiveCallPreflight(failing, HYPOTHETICAL_ALL_CONFIRMED).live).toBe(
        'BLOCKED',
      );
    }
    const pending: RepositoryTruth = {
      ...HYPOTHETICAL_ALL_CONFIRMED,
      contracts: {
        ...HYPOTHETICAL_ALL_CONFIRMED.contracts,
        millisSessionValidity: 'PROVIDER_UNVERIFIED',
      },
    };
    expect(evaluateFirstLiveCallPreflight(facts, pending).live).toBe('BLOCKED');
  });

  it.each([
    [
      'foreign destination',
      { [LIVE_TEST_ENV.destination]: '+15555550100' },
      '8-destination-owned-by-operator',
    ],
    [
      'foreign caller id',
      { [LIVE_TEST_ENV.twilioCallerId]: '+15555550101' },
      '2-twilio-number-and-regulatory-bundle',
    ],
    [
      'missing authorization reference',
      { [LIVE_TEST_ENV.authorizationRef]: undefined },
      '9-specific-human-authorization',
    ],
    [
      'unknown attestation',
      { [LIVE_TEST_ENV.attestations]: 'trust_me' },
      '6-legal-and-regulatory-review',
    ],
  ])('%s keeps the blocker pending for the operator', (_name, overrides, id) => {
    const blocker = report({ ...COMPLETE_ENV, ...overrides }).blockers.find((b) => b.id === id);
    expect(blocker?.status).toBe('PENDING_OPERATOR');
  });
});
