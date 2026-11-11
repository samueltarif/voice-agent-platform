import {
  evaluateOf6Blockers,
  CURRENT_REPOSITORY_TRUTH,
  type Facts,
  type RepositoryTruth,
  type PreflightCheck,
} from './first-live-call-blockers.js';

/**
 * 008-OF6 — Preflight da primeira chamada real. PURO: não faz chamada, não
 * consulta fornecedor, não compra nada e não cria sessão. Nunca declara
 * PROVIDER_VALIDATED (isso exige uma chamada real autorizada e bem-sucedida).
 */
export type LiveReadiness = 'BLOCKED' | 'READY_FOR_OPERATOR_CONTROLLED_PROVIDER_VALIDATION';

export interface PreflightReport {
  /** Declaração de código; a evidência é o gate no HEAD exato. */
  readonly offline: 'OFFLINE_INTEGRATION_READY';
  readonly live: LiveReadiness;
  readonly blockers: readonly PreflightCheck[];
  readonly technical: readonly PreflightCheck[];
}

function codeBlocked(id: string, done: boolean, reason: string): PreflightCheck {
  return { id, status: done ? 'PASS' : 'BLOCKED_CODE', reason };
}
function pass(id: string, ok: boolean, reason: string): PreflightCheck {
  return { id, status: ok ? 'PASS' : 'FAIL', reason };
}

export function evaluateTechnicalChecks(facts: Facts, truth: RepositoryTruth): PreflightCheck[] {
  const f = facts.formats;
  const credentials = [
    f.twilioAccountSid,
    f.twilioApiKeySid,
    f.twilioApiKeySecret,
    f.twilioAuthToken,
    f.millisApiKey,
  ];
  return [
    pass('environment-is-staging', facts.isStaging, 'APP_ENV deve ser staging.'),
    pass(
      'live-test-explicitly-enabled',
      facts.liveTestEnabled,
      'LIVE_TEST_ENABLED=true explícito.',
    ),
    pass(
      'kill-switch-released-by-operator',
      facts.killSwitchReleased,
      'LIVE_TEST_KILL_SWITCH=released só no momento autorizado.',
    ),
    pass(
      'credentials-present-and-well-formed',
      credentials.every((c) => c === 'OK'),
      'Presença e formato (nunca valores).',
    ),
    pass(
      'provider-regions-valid',
      f.twilioSipRegion === 'OK' && f.millisRegion === 'OK',
      'Região SIP Twilio e região Millis documentadas.',
    ),
    pass(
      'single-call-limits',
      f.maxConcurrency === 'OK' && f.maxDurationSeconds === 'OK',
      'Concorrência 1 e duração 30–600 s.',
    ),
    pass(
      'database-target-confirmed',
      facts.databaseHostMatches,
      'Host do banco igual ao esperado e não local.',
    ),
    codeBlocked(
      'live-composition-root',
      truth.platform.liveCompositionRoot,
      'Composição real (transportes com fetch) não existe; só testes offline.',
    ),
  ];
}

export function evaluateFirstLiveCallPreflight(
  facts: Facts,
  truth: RepositoryTruth = CURRENT_REPOSITORY_TRUTH,
): PreflightReport {
  const blockers = evaluateOf6Blockers(facts, truth);
  const technical = evaluateTechnicalChecks(facts, truth);
  const ready = [...blockers, ...technical].every((check) => check.status === 'PASS');
  return {
    offline: 'OFFLINE_INTEGRATION_READY',
    live: ready ? 'READY_FOR_OPERATOR_CONTROLLED_PROVIDER_VALIDATION' : 'BLOCKED',
    blockers,
    technical,
  };
}
