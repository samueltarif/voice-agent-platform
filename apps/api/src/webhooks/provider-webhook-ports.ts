import type {
  OutboundBudgetPort,
  ProviderWebhookAuthenticator,
  ProviderWebhookNormalizer,
  ToolPort,
} from '@voice-agent/contracts';
import type { DrizzleProviderEventAttemptStore } from '@voice-agent/database';
import type { Logger } from '@voice-agent/logger';

/** Autenticador + normalizador de UM provedor (contratos oficiais: 008-OF5). */
export interface ProviderWebhookAdapter {
  readonly authenticator: ProviderWebhookAuthenticator;
  readonly normalizer: ProviderWebhookNormalizer;
}

export type ProviderEventAttemptStorePort = Pick<
  DrizzleProviderEventAttemptStore,
  'resolveByProviderReference' | 'applyProviderEvent'
>;

export interface ProviderWebhookDependencies {
  /** Provedores habilitados por nome de rota; ausente = 401 uniforme. */
  readonly providers: ReadonlyMap<string, ProviderWebhookAdapter>;
  readonly store: ProviderEventAttemptStorePort;
  readonly budget: Pick<OutboundBudgetPort, 'releaseBudget'>;
  readonly tools: ToolPort;
  /** Limite interno de execução de ferramenta; sem valor oficial do provedor (NOT_VERIFIED). */
  readonly toolTimeoutMs: number;
  readonly logger: Logger;
  readonly now: () => Date;
}

/** Resposta HTTP neutra produzida pelo pipeline (independente do framework). */
export interface ProviderWebhookResponse {
  readonly status: 200 | 202 | 400 | 401;
  readonly body: Readonly<Record<string, unknown>>;
}
