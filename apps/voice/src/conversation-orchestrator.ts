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
import { transitionCallSession } from './call-session-state-machine.js';
import type {
  ConversationOrchestratorDependencies,
  OrchestratorOptions,
} from './conversation-orchestrator-types.js';

export type { ConversationOrchestratorDependencies, OrchestratorOptions };

function resolveOrchestratorDeps(
  deps: CallSessionStorePort | ConversationOrchestratorDependencies,
  transport?: VoiceTransportPort,
  model?: ConversationModelPort,
): ConversationOrchestratorDependencies {
  if ('sessionStore' in deps) return deps;
  return { sessionStore: deps, transport: transport!, model: model! };
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
    const resolved = resolveOrchestratorDeps(deps, transport, model);
    this.sessionStore = resolved.sessionStore;
    this.transport = resolved.transport;
    this.logger = resolved.options?.logger ?? createNullLogger();
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
    const opt = reason ? { reason } : undefined;
    await this.handleTerminalState(session, isPre ? 'FAILED' : 'ENDED', opt);
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
    const staleCancelledGen = `stale_${turnId}_${++this.generationCounter}`;
    this.activeGenerations.set(session.callId, staleCancelledGen);

    try {
      const opt = previousGen !== undefined ? { generationId: previousGen } : undefined;
      await this.transport.interruptSpeech(session.callId, opt);
    } catch (err) {
      throw new VoiceTransportError(
        err instanceof Error ? err.message : 'Transport interrupt error',
      );
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
    this.activeGenerations.delete(session.callId);
    void this.streamCoordinator.clearHistory(session.organizationId, session.callId);

    const failOpt = options?.reason !== undefined ? { failureReason: options.reason } : undefined;
    const isEnding = targetState === 'ENDED' && session.runtimeState === 'ACTIVE';
    const base = isEnding ? transitionCallSession(session, 'ENDING') : session;
    const current = transitionCallSession(base, targetState, failOpt);

    await this.sessionStore.save(current);
    await this.transport.endCall(session.callId, options?.reason);
  }
}
