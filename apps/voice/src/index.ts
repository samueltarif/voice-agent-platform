import type { DomainEvent, TelephonyPort } from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';

export interface VoiceEngineContext {
  readonly logger: Logger;
  readonly telephony?: TelephonyPort;
}

export function createVoiceContext(): VoiceEngineContext {
  return {
    logger: createNullLogger(),
  };
}

export const VOICE_APP = 'voice' as const;
export type { DomainEvent };

export * from './call-session-state-machine.js';
export * from './create-call-session.js';
export * from './in-memory-call-session-store.js';
export * from './assistant-stream-coordinator.js';
export * from './call-session-lifecycle-coordinator.js';
export * from './deterministic-response-delivery-coordinator.js';
export * from './conversation-orchestrator.js';
export * from './fake-voice-transport.js';
export * from './fake-conversation-model.js';
export * from './in-memory-call-bootstrap-registry.js';
export * from './call-lifecycle-gateway.js';
export * from './in-memory-conversation-history-store.js';
export * from './conversation-context-composer.js';
export * from './auxiliary-turn-shadow-observer.js';
export * from './operating-hours-capability-matcher.js';
export * from './operating-hours-turn-handler.js';
export * from './frozen-policy-interpreter.js';
export * from './deterministic-response-delivery.js';
export * from './security-blocked-action.js';
export * from './security-blocked-response.js';
export * from './guarded-turn-routing-coordinator.js';
export * from './human-handoff-state-machine.js';
export * from './tool-registry.js';
export * from './tool-execution-engine.js';
export * from './operating-hours-tool.js';
export * from './build-safe-log-context.js';
export * from './published-version-toolset.js';
export * from './catalog-query-port.js';
export * from './catalog-search-tool.js';
export * from './catalog-item-detail-tool.js';
export * from './outbound-call-lifecycle-bootstrap-adapter.js';
export * from './voice-knowledge-scope.js';
export * from './voice-knowledge-context-envelope.js';
export * from './voice-knowledge-retrieval-coordinator.js';
