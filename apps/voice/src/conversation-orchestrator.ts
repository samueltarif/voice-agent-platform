import type {
  AgentConfigurationSnapshotV1,
  CallSession,
  CallSessionStorePort,
  ConversationModelPort,
  UserSpeechFinalEvent,
  VoiceInputEvent,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import { TERMINAL_CALL_SESSION_STATES } from '@voice-agent/contracts';
import {
  CallRuntimeNotActiveError,
  CallSessionNotFoundError,
  VoiceTransportError,
} from '@voice-agent/errors';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { AssistantStreamCoordinator } from './assistant-stream-coordinator.js';
import { transitionCallSession } from './call-session-state-machine.js';

export interface OrchestratorOptions {
  readonly logger?: Logger;
  readonly enableTranscriptLogging?: boolean;
}

export interface ConversationOrchestratorDependencies {
  readonly sessionStore: CallSessionStorePort;
  readonly transport: VoiceTransportPort;
  readonly model: ConversationModelPort;
  readonly options?: OrchestratorOptions;
}

export class ConversationOrchestrator {
  private readonly sessionStore: CallSessionStorePort;
  private readonly transport: VoiceTransportPort;
  private readonly logger: Logger;
  private readonly streamCoordinator: AssistantStreamCoordinator;
  private readonly activeGenerations = new Map<string, string>();
  private generationCounter = 0;

  constructor(
    deps: CallSessionStorePort | ConversationOrchestratorDependencies,
    transport?: VoiceTransportPort,
    model?: ConversationModelPort,
  ) {
    const isDeps = 'sessionStore' in deps;
    this.sessionStore = isDeps ? deps.sessionStore : deps;
    this.transport = isDeps ? deps.transport : transport!;
    this.logger = isDeps ? (deps.options?.logger ?? createNullLogger()) : createNullLogger();
    const mdl = isDeps ? deps.model : model!;
    this.streamCoordinator = new AssistantStreamCoordinator(this.transport, mdl, this.logger);
  }

  async handleEvent(
    event: VoiceInputEvent,
    snapshot?: AgentConfigurationSnapshotV1,
  ): Promise<void> {
    const session = await this.sessionStore.getById(event.organizationId, event.callId);
    if (!session) throw new CallSessionNotFoundError(`Call session ${event.callId} not found`);

    this.logger.info(`Handling voice event '${event.type}'`, {
      callId: event.callId,
      organizationId: event.organizationId,
    });
    await this.dispatchEvent(session, event, snapshot);
  }

  private async dispatchEvent(
    session: CallSession,
    event: VoiceInputEvent,
    snapshot?: AgentConfigurationSnapshotV1,
  ): Promise<void> {
    switch (event.type) {
      case 'transport.connected':
        return this.handleTransportConnected(session);
      case 'user.speech.final':
        return this.handleUserSpeechFinal(session, event, snapshot);
      case 'user.interruption':
        return this.handleUserInterruption(session, event.turnId);
      case 'call.end.requested':
      case 'transport.disconnected':
        return this.handleDisconnectOrEnd(session, event.reason);
      case 'provider.failure':
        return this.handleTerminalState(session, 'FAILED', { reason: event.error });
    }
  }

  private async handleDisconnectOrEnd(session: CallSession, reason?: string): Promise<void> {
    const opt = reason !== undefined ? { reason } : undefined;
    const isPreActive = session.runtimeState === 'CONNECTING' || session.runtimeState === 'CREATED';
    const target = isPreActive ? 'FAILED' : 'ENDED';
    return this.handleTerminalState(session, target, opt);
  }

  private async handleTransportConnected(session: CallSession): Promise<void> {
    const connecting = transitionCallSession(session, 'CONNECTING');
    const active = transitionCallSession(connecting, 'ACTIVE');
    await this.sessionStore.save(active);
  }

  private async handleUserSpeechFinal(
    session: CallSession,
    event: UserSpeechFinalEvent,
    snapshot?: AgentConfigurationSnapshotV1,
  ): Promise<void> {
    if (!snapshot) throw new Error('Agent snapshot is required for speech processing');
    if (session.runtimeState !== 'ACTIVE') {
      throw new CallRuntimeNotActiveError(`Call ${session.callId} is not ACTIVE`);
    }

    const { turnId, transcript } = event;
    const generationId = `gen_${turnId}_${++this.generationCounter}`;
    this.activeGenerations.set(session.callId, generationId);

    const history = this.streamCoordinator.getOrCreateHistory(session.callId);
    history.push({ role: 'user', content: transcript, turnId });
    await this.sessionStore.save({ ...session, currentTurnId: turnId, generationId });

    await this.streamCoordinator.streamTurn({
      session,
      turnId,
      generationId,
      snapshot,
      isGenerationActive: (callId, genId) => this.activeGenerations.get(callId) === genId,
    });
  }

  private async handleUserInterruption(session: CallSession, turnId: string): Promise<void> {
    if (session.runtimeState !== 'ACTIVE') return;

    const previousGen = this.activeGenerations.get(session.callId);
    const staleCancelledGen = `stale_${turnId}_${++this.generationCounter}`;
    this.activeGenerations.set(session.callId, staleCancelledGen);

    try {
      const opt = previousGen !== undefined ? { generationId: previousGen } : undefined;
      await this.transport.interruptSpeech(session.callId, opt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transport interrupt error';
      throw new VoiceTransportError(msg);
    }

    await this.sessionStore.save({
      ...session,
      currentTurnId: turnId,
      generationId: staleCancelledGen,
    });
  }

  private async handleTerminalState(
    session: CallSession,
    targetState: 'ENDED' | 'FAILED',
    options?: { reason?: string },
  ): Promise<void> {
    if (TERMINAL_CALL_SESSION_STATES.has(session.runtimeState)) return;
    this.cleanupSession(session.callId);
    let current = session;
    if (targetState === 'ENDED') {
      if (current.runtimeState === 'ACTIVE') {
        current = transitionCallSession(current, 'ENDING');
      }
      current = transitionCallSession(current, 'ENDED');
    } else {
      const failOpt = options?.reason !== undefined ? { failureReason: options.reason } : undefined;
      current = transitionCallSession(current, 'FAILED', failOpt);
    }
    await this.sessionStore.save(current);
    await this.transport.endCall(session.callId, options?.reason);
  }

  private cleanupSession(callId: string): void {
    this.activeGenerations.delete(callId);
    this.streamCoordinator.clearHistory(callId);
  }
}
