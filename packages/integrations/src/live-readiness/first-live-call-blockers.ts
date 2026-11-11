import type {
  LiveTestEnvironmentFacts,
  OperatorAttestation,
} from './first-live-call-environment.js';

/**
 * 008-OF6 — Os nove bloqueios obrigatórios da ROADMAP antes de qualquer
 * chamada real. O estado de contratos e de código é a VERDADE ATUAL do
 * repositório e só muda por PR com evidência, nunca por variável de ambiente.
 */
export type ContractStatus = 'CONFIRMED' | 'PROVIDER_UNVERIFIED' | 'REQUIRES_PROVIDER_SUPPORT';

export interface RepositoryTruth {
  readonly contracts: {
    readonly twilioToMillisSipPlus55: ContractStatus;
    readonly millisRegisterSipCallResponse: ContractStatus;
    readonly millisSessionValidity: ContractStatus;
    readonly millisWebhookAuthentication: ContractStatus;
  };
  readonly platform: {
    readonly durableSessionTokenLegPersistence: boolean;
    readonly liveCompositionRoot: boolean;
    readonly publicWebhookRoutesMounted: boolean;
  };
}

/** Estado ATUAL do repositório (2026-11-11). Mudar exige PR com evidência. */
export const CURRENT_REPOSITORY_TRUTH: RepositoryTruth = {
  contracts: {
    twilioToMillisSipPlus55: 'REQUIRES_PROVIDER_SUPPORT',
    millisRegisterSipCallResponse: 'PROVIDER_UNVERIFIED',
    millisSessionValidity: 'PROVIDER_UNVERIFIED',
    millisWebhookAuthentication: 'PROVIDER_UNVERIFIED',
  },
  platform: {
    durableSessionTokenLegPersistence: false,
    liveCompositionRoot: false,
    publicWebhookRoutesMounted: false,
  },
};

export type CheckStatus =
  'PASS' | 'FAIL' | 'PENDING_OPERATOR' | 'BLOCKED_PROVIDER' | 'BLOCKED_CODE';

export interface PreflightCheck {
  readonly id: string;
  readonly status: CheckStatus;
  readonly reason: string;
}

export type Facts = LiveTestEnvironmentFacts;

interface AttestedCheck {
  readonly id: string;
  readonly item: OperatorAttestation;
  readonly reason: string;
  readonly formatsOk?: boolean;
}

function attested(facts: Facts, check: AttestedCheck): PreflightCheck {
  const ok = facts.attested.has(check.item) && check.formatsOk !== false;
  return { id: check.id, status: ok ? 'PASS' : 'PENDING_OPERATOR', reason: check.reason };
}

function providerCheck(id: string, confirmed: boolean, reason: string): PreflightCheck {
  return { id, status: confirmed ? 'PASS' : 'BLOCKED_PROVIDER', reason };
}

function codeBlocked(id: string, done: boolean, reason: string): PreflightCheck {
  return { id, status: done ? 'PASS' : 'BLOCKED_CODE', reason };
}

function blockersOneToFive(facts: Facts, truth: RepositoryTruth): PreflightCheck[] {
  const f = facts.formats;
  const c = truth.contracts;
  const millisConfirmed = [
    c.millisRegisterSipCallResponse,
    c.millisSessionValidity,
    c.millisWebhookAuthentication,
  ].every((status) => status === 'CONFIRMED');
  return [
    providerCheck(
      '1-twilio-millis-plus55-compatibility',
      c.twilioToMillisSipPlus55 === 'CONFIRMED',
      'Twilio→<Dial><Sip>→Millis em saída +55 não homologado (chamado técnico pendente).',
    ),
    attested(facts, {
      id: '2-twilio-number-and-regulatory-bundle',
      item: 'twilio_number_and_regulatory_bundle_approved',
      reason: 'Número brasileiro Twilio e cadastro regulatório aprovados no console.',
      formatsOk: f.twilioCallerId === 'OK',
    }),
    providerCheck(
      '3-millis-contracts-and-webhook-auth',
      millisConfirmed,
      'Resposta de register_sip_call, validade da sessão e autenticação do webhook não confirmadas pela Millis.',
    ),
    codeBlocked(
      '4-reconciliation-and-durable-ledger',
      truth.platform.durableSessionTokenLegPersistence,
      'Reconciliação testada offline; sessão, token e pernas ainda em memória (migration não autorizada).',
    ),
    attested(facts, {
      id: '5-hard-budget-cap',
      item: 'budget_cap_approved',
      reason: 'Teto de gasto aprovado pelo operador.',
      formatsOk: f.budgetCapMinorUnits === 'OK',
    }),
  ];
}

function blockersSixToNine(facts: Facts, truth: RepositoryTruth): PreflightCheck[] {
  const f = facts.formats;
  const stagingReady =
    truth.platform.publicWebhookRoutesMounted &&
    facts.attested.has('staging_tls_fqdn_verified') &&
    f.callbackBaseUrl === 'OK';
  return [
    attested(facts, {
      id: '6-legal-and-regulatory-review',
      item: 'legal_and_regulatory_review_done',
      reason: 'Revisão Anatel/telemarketing/0303 e LGPD registrada.',
    }),
    codeBlocked(
      '7-staging-tls-and-public-webhooks',
      stagingReady,
      'Staging com TLS/FQDN e rotas de callback montadas (PUBLIC_WEBHOOKS=0 hoje).',
    ),
    attested(facts, {
      id: '8-destination-owned-by-operator',
      item: 'destination_owned_by_operator',
      reason: 'Destino +55 do próprio operador.',
      formatsOk: f.destination === 'OK',
    }),
    attested(facts, {
      id: '9-specific-human-authorization',
      item: 'single_call_authorized',
      reason: 'Autorização humana específica para número, créditos e UMA chamada.',
      formatsOk: f.authorizationRef === 'OK',
    }),
  ];
}

/** Os nove bloqueios obrigatórios da 008-OF6 (ROADMAP), na ordem original. */
export function evaluateOf6Blockers(facts: Facts, truth: RepositoryTruth): PreflightCheck[] {
  return [...blockersOneToFive(facts, truth), ...blockersSixToNine(facts, truth)];
}
