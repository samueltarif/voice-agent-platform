import {
  type AgentConfigurationSnapshotV1,
  type CallSession,
  type CallSessionStorePort,
  type ConversationModelPort,
  TERMINAL_CALL_SESSION_STATES,
  type UserSpeechFinalEvent,
  type VoiceInputEvent,
  type VoiceTransportPort,
} from '@voice-agent/contracts';
import {
  CallRuntimeNotActiveError,
  CallSessionNotFoundError,
  VoiceTransportError,
} from '@voice-agent/errors';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { AssistantStreamCoordinator } from './assistant-stream-coordinator.js';
import type { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';
import {
  transitionCallSession,
  transitionToTerminalSession,
} from './call-session-state-machine.js';
import {
  type ConversationOrchestratorDependencies,
  type OrchestratorOptions,
  resolveOrchestratorDeps,
} from './conversation-orchestrator-types.js';

export type { ConversationOrchestratorDependencies, OrchestratorOptions };

export class ConversationOrchestrator {
  private readonly sessionStore: CallSessionStorePort;
  private readonly transport: VoiceTransportPort;
  private readonly logger: Logger;
  private readonly streamCoordinator: AssistantStreamCoordinator;
  private readonly shadowObserver?: AuxiliaryTurnShadowObserver | undefined;
  private readonly activeGenerations = new Map<string, string>();
  private generationCounter = 0;

  constructor(
    deps: CallSessionStorePort | ConversationOrchestratorDependencies,
    transport?: VoiceTransportPort,
    model?: ConversationModelPort,
  ) {
    const resolved = resolveOrchestratorDeps(deps, transport, model);
    this.sessionStore = resolved.sessionStore;
    this.transport = resolved.transport;
    this.logger = resolved.options?.logger ?? createNullLogger();
    this.shadowObserver = resolved.shadowObserver;
    this.streamCoordinator = new AssistantStreamCoordinator({
      transport: this.transport,
      model: resolved.model,
      logger: this.logger,
      historyStore: resolved.historyStore,
      contextComposer: resolved.contextComposer,
    });
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

  private async handleConnected(session: CallSession): Promise<void> {
    const connecting = transitionCallSession(session, 'CONNECTING');
    await this.sessionStore.save(transitionCallSession(connecting, 'ACTIVE'));
  }

  private async handleDisconnect(session: CallSession, reason?: string): Promise<void> {
    const isPre = session.runtimeState === 'CONNECTING' || session.runtimeState === 'CREATED';
    await this.handleTerminalState(
      session,
      isPre ? 'FAILED' : 'ENDED',
      reason ? { reason } : undefined,
    );
  }

  private async dispatchEvent(
    session: CallSession,
    event: VoiceInputEvent,
    snapshot?: AgentConfigurationSnapshotV1,
  ): Promise<void> {
    switch (event.type) {
      case 'transport.connected':
        return this.handleConnected(session);
      case 'user.speech.final':
        return this.handleUserSpeechFinal(session, event, snapshot);
      case 'user.interruption':
        return this.handleUserInterruption(session, event.turnId);
      case 'call.end.requested':
      case 'transport.disconnected':
        return this.handleDisconnect(session, event.reason);
      case 'provider.failure':
        return this.handleTerminalState(session, 'FAILED', { reason: event.error });
    }
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

    try {
      this.shadowObserver?.observeTurn({
        organizationId: session.organizationId,
        callId: session.callId,
        turnId,
        callerTranscript: transcript,
      });
    } catch {
      // Shadow observer must NEVER throw into authoritative path
    }

    await this.streamCoordinator.appendUserUtterance(session, turnId, transcript);
    await this.sessionStore.save({ ...session, currentTurnId: turnId, generationId });

    await this.streamCoordinator.streamTurn({
      session,
      turnId,
      generationId,
      snapshot,
      callerTranscript: transcript,
      isGenerationActive: (cId, gId) => this.activeGenerations.get(cId) === gId,
    });
  }

  private async handleUserInterruption(session: CallSession, turnId: string): Promise<void> {
    if (session.runtimeState !== 'ACTIVE') return;

    const previousGen = this.activeGenerations.get(session.callId);
    const staleGen = `stale_${turnId}_${++this.generationCounter}`;
    this.activeGenerations.set(session.callId, staleGen);

    const opt = previousGen !== undefined ? { generationId: previousGen } : undefined;
    await this.transport.interruptSpeech(session.callId, opt).catch((err) => {
      throw new VoiceTransportError(
        err instanceof Error ? err.message : 'Transport interrupt error',
      );
    });

    await this.sessionStore.save({ ...session, currentTurnId: turnId, generationId: staleGen });
  }

  private async handleTerminalState(
    session: CallSession,
    targetState: 'ENDED' | 'FAILED',
    options?: { reason?: string },
  ): Promise<void> {
    if (TERMINAL_CALL_SESSION_STATES.has(session.runtimeState)) return;
    this.activeGenerations.delete(session.callId);
    this.shadowObserver?.abortCall(session.callId);
    void this.streamCoordinator.clearHistory(session.organizationId, session.callId);

    const current = transitionToTerminalSession(session, targetState, options?.reason);
    await this.sessionStore.save(current);
    await this.transport.endCall(session.callId, options?.reason);
  }
}
