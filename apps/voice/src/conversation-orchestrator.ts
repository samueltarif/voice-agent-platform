import type {
  AgentConfigurationSnapshotV1,
  CallSession,
  CallSessionStorePort,
  ConversationModelPort,
  UserInterruptionEvent,
  UserSpeechFinalEvent,
  VoiceInputEvent,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import {
  CallRuntimeNotActiveError,
  CallSessionNotFoundError,
  VoiceTransportError,
} from '@voice-agent/errors';
import type { Logger } from '@voice-agent/logger';
import { AssistantStreamCoordinator } from './assistant-stream-coordinator.js';
import type { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';
import { CallSessionLifecycleCoordinator } from './call-session-lifecycle-coordinator.js';
import {
  type ConversationOrchestratorDependencies,
  type OrchestratorOptions,
  resolveOrchestratorContext,
} from './conversation-orchestrator-types.js';
import { DeterministicResponseDeliveryCoordinator } from './deterministic-response-delivery-coordinator.js';
import type { DispatchDeterministicResponseInput } from './deterministic-response-delivery.js';

export type { ConversationOrchestratorDependencies, OrchestratorOptions };

export class ConversationOrchestrator {
  private readonly sessionStore: CallSessionStorePort;
  private readonly transport: VoiceTransportPort;
  private readonly logger: Logger;
  private readonly streamCoordinator: AssistantStreamCoordinator;
  private readonly shadowObserver?: AuxiliaryTurnShadowObserver | undefined;
  private readonly deterministicDeliveryCoordinator: DeterministicResponseDeliveryCoordinator;
  private readonly lifecycleCoordinator: CallSessionLifecycleCoordinator;
  private readonly activeGenerations = new Map<string, string>();
  private generationCounter = 0;

  constructor(
    deps: CallSessionStorePort | ConversationOrchestratorDependencies,
    transport?: VoiceTransportPort,
    model?: ConversationModelPort,
  ) {
    const ctx = resolveOrchestratorContext(deps, transport, model);
    this.sessionStore = ctx.sessionStore;
    this.transport = ctx.transport;
    this.logger = ctx.logger;
    this.shadowObserver = ctx.shadowObserver;
    this.streamCoordinator = ctx.streamCoordinator;
    this.deterministicDeliveryCoordinator = new DeterministicResponseDeliveryCoordinator({
      transport: this.transport,
      historyStore: ctx.historyStore,
      logger: this.logger,
      isGenerationActive: (cId, gId) => this.activeGenerations.get(cId) === gId,
    });
    this.lifecycleCoordinator = new CallSessionLifecycleCoordinator({
      sessionStore: this.sessionStore,
      transport: this.transport,
      onCallTerminated: (orgId, callId) => this.cleanupTerminatedCall(orgId, callId),
    });
  }

  private cleanupTerminatedCall(organizationId: string, callId: string): void {
    this.activeGenerations.delete(callId);
    this.deterministicDeliveryCoordinator.clearCall(callId);
    this.shadowObserver?.abortCall(callId);
    void this.streamCoordinator.clearHistory(organizationId, callId);
  }

  private observeShadowTurn(session: CallSession, turnId: string, callerTranscript: string): void {
    try {
      this.shadowObserver?.observeTurn({
        organizationId: session.organizationId,
        callId: session.callId,
        turnId,
        callerTranscript,
      });
    } catch {
      // Shadow observer must NEVER throw into authoritative path
    }
  }

  private async interruptTransport(callId: string, generationId?: string): Promise<void> {
    const opt = generationId !== undefined ? { generationId } : undefined;
    await this.transport.interruptSpeech(callId, opt).catch((err) => {
      throw new VoiceTransportError(
        err instanceof Error ? err.message : 'Transport interrupt error',
      );
    });
  }

  /** Offline delivery seam: OPTION_B ownership commit before speak(). NO routing wired. */
  async deliverDeterministicResponse(input: DispatchDeterministicResponseInput): Promise<void> {
    await this.deterministicDeliveryCoordinator.deliver(input);
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

    if (await this.lifecycleCoordinator.handleLifecycleEvent(session, event)) return;

    if (event.type === 'user.speech.final') {
      return this.handleUserSpeechFinal(session, event, snapshot);
    }
    if (event.type === 'user.interruption') {
      return this.handleUserInterruption(session, event);
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

    await this.deterministicDeliveryCoordinator.resolveOnUserSpeechFinal(session);

    const { turnId, transcript } = event;
    const generationId = `gen_${turnId}_${++this.generationCounter}`;
    this.activeGenerations.set(session.callId, generationId);

    this.observeShadowTurn(session, turnId, transcript);

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

  private async handleUserInterruption(
    session: CallSession,
    event: UserInterruptionEvent,
  ): Promise<void> {
    if (session.runtimeState !== 'ACTIVE') return;

    const previousGen = this.activeGenerations.get(session.callId);
    const staleGen = `stale_${event.turnId}_${++this.generationCounter}`;
    this.activeGenerations.set(session.callId, staleGen);

    await this.interruptTransport(session.callId, previousGen);
    await this.deterministicDeliveryCoordinator.resolveOnInterruption(
      session,
      event.interruptedUtterance,
    );

    await this.sessionStore.save({
      ...session,
      currentTurnId: event.turnId,
      generationId: staleGen,
    });
  }
}
