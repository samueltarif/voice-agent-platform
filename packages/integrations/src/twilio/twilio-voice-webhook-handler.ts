import { deriveWebSocketUrl, type VoiceGatewayConfig } from '@voice-agent/config';
import type { CallBootstrap } from '@voice-agent/contracts';
import {
  CallBootstrapAlreadyConsumedError,
  CallBootstrapExpiredError,
  CallBootstrapNotFoundError,
  InvalidProviderBindingError,
  ProviderAuthenticationError,
} from '@voice-agent/errors';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import type { CallLifecycleGateway } from '@voice-agent/voice';
import { resolveTwilioCanonicalUrl } from './twilio-canonical-url-resolver.js';
import { validateTwilioSignature } from './twilio-signature-validator.js';
import { generateConversationRelayTwiML } from './twilio-twiml-generator.js';

export interface TwilioVoiceWebhookHttpRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly query?: Record<string, string | string[] | undefined> | undefined;
  readonly body?: Record<string, string> | undefined;
}

export interface TwilioVoiceWebhookHttpResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface TwilioVoiceWebhookHandlerDependencies {
  readonly gateway: CallLifecycleGateway;
  readonly config: VoiceGatewayConfig;
  readonly authToken: string;
  readonly logger?: Logger | undefined;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractSingleHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return Array.isArray(val) ? val[0] : val;
  }
  return undefined;
}

function extractSignature(
  headers: Record<string, string | string[] | undefined>,
  logger: Logger,
): string {
  const signature = extractSingleHeader(headers, 'x-twilio-signature');
  if (!signature) {
    logger.warn('twilio.webhook.rejected', { reason: 'missing_signature' });
    throw new ProviderAuthenticationError('Missing X-Twilio-Signature header');
  }
  return signature;
}

function validateRequestSignature(
  req: TwilioVoiceWebhookHttpRequest,
  deps: TwilioVoiceWebhookHandlerDependencies,
  logger: Logger,
): void {
  const signature = extractSignature(req.headers, logger);
  const queryParams: Record<string, string | string[] | undefined> = {};
  if (req.query) {
    for (const [k, v] of Object.entries(req.query)) {
      if (v !== undefined) queryParams[k] = v;
    }
  }

  const canonicalUrl = resolveTwilioCanonicalUrl({
    publicBaseUrl: deps.config.publicVoiceBaseUrl,
    requestPath: req.path,
    query: queryParams,
  });

  const isValid = validateTwilioSignature({
    url: canonicalUrl,
    params: req.body,
    signature,
    authToken: deps.authToken,
  });

  if (!isValid) {
    logger.warn('twilio.webhook.rejected', { reason: 'invalid_signature' });
    throw new ProviderAuthenticationError('Invalid X-Twilio-Signature');
  }
}

function extractValidBootstrapId(req: TwilioVoiceWebhookHttpRequest): string {
  const rawQuery = req.query?.['bootstrapId'];
  const rawId = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) ?? req.body?.['bootstrapId'];

  if (!rawId || typeof rawId !== 'string' || !UUID_REGEX.test(rawId)) {
    throw new InvalidProviderBindingError('Missing or invalid bootstrapId parameter');
  }
  return rawId;
}

function assertValidBootstrap(
  bootstrap: CallBootstrap | null,
  rawBootstrapId: string,
  now: Date,
): asserts bootstrap is CallBootstrap {
  if (!bootstrap) {
    throw new CallBootstrapNotFoundError(`Call bootstrap not found: '${rawBootstrapId}'`);
  }
  if (bootstrap.status === 'CONSUMED') {
    throw new CallBootstrapAlreadyConsumedError(
      `Call bootstrap '${rawBootstrapId}' has already been consumed`,
    );
  }
  if (now.getTime() > bootstrap.expiresAt.getTime() || bootstrap.status === 'EXPIRED') {
    throw new CallBootstrapExpiredError(`Call bootstrap '${rawBootstrapId}' has expired`);
  }
}

export async function handleTwilioVoiceWebhook(
  req: TwilioVoiceWebhookHttpRequest,
  deps: TwilioVoiceWebhookHandlerDependencies,
  now = new Date(),
): Promise<TwilioVoiceWebhookHttpResponse> {
  const logger = deps.logger ?? createNullLogger();
  validateRequestSignature(req, deps, logger);

  const bootstrapId = extractValidBootstrapId(req);
  const bootstrap = await deps.gateway.getBootstrap(bootstrapId);
  assertValidBootstrap(bootstrap, bootstrapId, now);

  const wsUrl = deriveWebSocketUrl(
    deps.config.publicVoiceBaseUrl,
    deps.config.conversationRelayPath,
  );

  const twiml = generateConversationRelayTwiML({
    websocketUrl: wsUrl,
    parameters: [{ name: 'bootstrapId', value: bootstrap.bootstrapId }],
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    body: twiml,
  };
}
