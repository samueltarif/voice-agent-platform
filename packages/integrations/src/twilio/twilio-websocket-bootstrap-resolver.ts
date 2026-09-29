import { type VoiceGatewayConfig } from '@voice-agent/config';
import { InvalidProviderBindingError, ProviderAuthenticationError } from '@voice-agent/errors';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import type { CallLifecycleGateway } from '@voice-agent/voice';
import { resolveTwilioCanonicalUrl } from './twilio-canonical-url-resolver.js';
import { validateTwilioSignature } from './twilio-signature-validator.js';
import type { TwilioSessionBindingContext } from './twilio-websocket-boundary.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TwilioWebSocketHandshakeRequest {
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly query?: Record<string, string | string[] | undefined> | undefined;
}

export interface ResolveBootstrapBindingInput {
  readonly handshake: TwilioWebSocketHandshakeRequest;
  readonly customParameters?: Record<string, unknown> | undefined;
}

export interface TwilioWebSocketBootstrapResolverDependencies {
  readonly gateway: CallLifecycleGateway;
  readonly config: VoiceGatewayConfig;
  readonly authToken: string;
  readonly logger?: Logger | undefined;
}

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

function extractBootstrapId(input: ResolveBootstrapBindingInput): string {
  const queryParam = input.handshake.query?.['bootstrapId'];
  const queryId = Array.isArray(queryParam) ? queryParam[0] : queryParam;
  const rawId = input.customParameters?.['bootstrapId'] ?? queryId;

  if (typeof rawId !== 'string' || !UUID_REGEX.test(rawId)) {
    throw new InvalidProviderBindingError(
      'Missing or invalid bootstrapId in WebSocket setup/query parameters',
    );
  }
  return rawId;
}

export class TwilioWebSocketBootstrapResolver {
  private readonly gateway: CallLifecycleGateway;
  private readonly config: VoiceGatewayConfig;
  private readonly authToken: string;
  private readonly logger: Logger;

  constructor(deps: TwilioWebSocketBootstrapResolverDependencies) {
    this.gateway = deps.gateway;
    this.config = deps.config;
    this.authToken = deps.authToken;
    this.logger = deps.logger ?? createNullLogger();
  }

  private validateHandshake(handshake: TwilioWebSocketHandshakeRequest): void {
    const signature = extractSingleHeader(handshake.headers, 'x-twilio-signature');
    if (!signature) {
      this.logger.warn('twilio.ws_handshake.rejected', { reason: 'missing_signature' });
      throw new ProviderAuthenticationError('Missing X-Twilio-Signature on WebSocket handshake');
    }

    const queryParams: Record<string, string | string[] | undefined> = {};
    if (handshake.query) {
      for (const [k, v] of Object.entries(handshake.query)) {
        if (v !== undefined) queryParams[k] = v;
      }
    }

    const canonicalUrl = resolveTwilioCanonicalUrl({
      publicBaseUrl: this.config.publicVoiceBaseUrl,
      requestPath: handshake.path,
      query: queryParams,
    });

    const isValid = validateTwilioSignature({
      url: canonicalUrl,
      signature,
      authToken: this.authToken,
    });

    if (!isValid) {
      this.logger.warn('twilio.ws_handshake.rejected', { reason: 'invalid_signature' });
      throw new ProviderAuthenticationError('Invalid X-Twilio-Signature on WebSocket handshake');
    }
  }

  async resolveBinding(
    input: ResolveBootstrapBindingInput,
    now = new Date(),
  ): Promise<TwilioSessionBindingContext> {
    if (!input.handshake) {
      throw new ProviderAuthenticationError('Missing WebSocket handshake context');
    }

    this.validateHandshake(input.handshake);
    const bootstrapId = extractBootstrapId(input);

    const { session, snapshot } = await this.gateway.consumeBootstrapAndInitializeSession(
      bootstrapId,
      now,
    );

    return {
      organizationId: session.organizationId,
      callId: session.callId,
      agentSnapshot: snapshot,
    };
  }
}
