import { InvalidProviderBindingError } from '@voice-agent/errors';
import type { CallLifecycleGateway } from '@voice-agent/voice';
import type { TwilioSessionBindingContext } from './twilio-websocket-boundary.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolveBootstrapBindingInput {
  readonly customParameters?: Record<string, unknown> | undefined;
  readonly queryParams?: Record<string, string | undefined> | undefined;
}

export class TwilioWebSocketBootstrapResolver {
  constructor(private readonly gateway: CallLifecycleGateway) {}

  async resolveBinding(
    input: ResolveBootstrapBindingInput,
    now = new Date(),
  ): Promise<TwilioSessionBindingContext> {
    const rawId = input.customParameters?.['bootstrapId'] ?? input.queryParams?.['bootstrapId'];

    if (typeof rawId !== 'string' || !UUID_REGEX.test(rawId)) {
      throw new InvalidProviderBindingError(
        'Missing or invalid bootstrapId in WebSocket setup/query parameters',
      );
    }

    const { session, snapshot } = await this.gateway.consumeBootstrapAndInitializeSession(
      rawId,
      now,
    );

    return {
      organizationId: session.organizationId,
      callId: session.callId,
      agentSnapshot: snapshot,
    };
  }
}
