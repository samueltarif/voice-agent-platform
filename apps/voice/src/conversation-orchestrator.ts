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
import {
  type ConversationOrchestratorDependencies,
  type ResolvedOrchestratorContext,
  type SpeechFinalTurnOptions,
  resolveOrchestratorContext,
} from './conversation-orchestrator-types.js';
import type { DispatchDeterministicResponseInput } from './deterministic-response-delivery.js';
import {
  type DeliverSecurityBlockedResponseInput,
  resolveSecurityBlockedDeliveryInput,
} from './security-blocked-response.js';

export class ConversationOrchestrator {
  private readonly ctx: ResolvedOrchestratorContext;
  private readonly activeGenerations = new Map<string, string>();
  private generationCounter = 0;

  constructor(
    deps: CallSessionStorePort | ConversationOrchestratorDependencies,
    transport?: VoiceTransportPort,
    model?: ConversationModelPort,
  ) {
    this.ctx = resolveOrchestratorContext({
      deps,
      transport,
      model,
      options: {
        isGenerationActive: (cId, gId) => this.activeGenerations.get(cId) === gId,
        onCallTerminated: (orgId, callId) => {
          this.activeGenerations.delete(callId);
          this.ctx.deterministicDeliveryCoordinator?.clearCall(callId);
          this.ctx.shadowObserver?.abortCall(callId);
          void this.ctx.streamCoordinator.clearHistory(orgId, callId);
        },
      },
    });
  }

  private observeShadowTurn(session: CallSession, turnId: string, callerTranscript: string): void {
    if (this.ctx.guardedRoutingCoordinator) return;
    try {
      const { organizationId, callId } = session;
      this.ctx.shadowObserver?.observeTurn({ organizationId, callId, turnId, callerTranscript });
    } catch {
      return;
    }
  }

  private async interruptTransport(callId: string, generationId?: string): Promise<void> {
    const opt = generationId !== undefined ? { generationId } : undefined;
    await this.ctx.transport.interruptSpeech(callId, opt).catch((err) => {
      throw new VoiceTransportError(
        err instanceof Error ? err.message : 'Transport interrupt error',
      );
    });
  }

  async deliverDeterministicResponse(input: DispatchDeterministicResponseInput): Promise<void> {
    await this.ctx.deterministicDeliveryCoordinator!.deliver(input);
  }

  async deliverSecurityBlockedResponse(input: DeliverSecurityBlockedResponseInput): Promise<void> {
    await this.ctx.deterministicDeliveryCoordinator!.deliver(
      resolveSecurityBlockedDeliveryInput(input),
    );
  }

  setActiveGenerationForTest(callId: string, generationId: string): void {
    this.activeGenerations.set(callId, generationId);
  }

  async handleEvent(
    event: VoiceInputEvent,
    snapshot?: AgentConfigurationSnapshotV1,
    configurationOrganizationId?: string,
  ): Promise<void> {
    const session = await this.ctx.sessionStore.getById(event.organizationId, event.callId);
    if (!session) throw new CallSessionNotFoundError(`Call session ${event.callId} not found`);

    this.ctx.logger.info(`Handling voice event '${event.type}'`, {
      callId: event.callId,
      organizationId: event.organizationId,
    });

    if (await this.ctx.lifecycleCoordinator!.handleLifecycleEvent(session, event)) return;
    if (event.type === 'user.speech.final') {
      return this.handleUserSpeechFinal(session, event, {
        snapshot,
        configurationOrganizationId,
      });
    }
    if (event.type === 'user.interruption') return this.handleUserInterruption(session, event);
  }

  private async handleUserSpeechFinal(
    session: CallSession,
    event: UserSpeechFinalEvent,
    options: SpeechFinalTurnOptions,
  ): Promise<void> {
    const { snapshot, configurationOrganizationId } = options;
    if (!snapshot) throw new Error('Agent snapshot is required for speech processing');
    if (session.runtimeState !== 'ACTIVE') {
      throw new CallRuntimeNotActiveError(`Call ${session.callId} is not ACTIVE`);
    }

    await this.ctx.deterministicDeliveryCoordinator!.resolveOnUserSpeechFinal(session);

    const { turnId, transcript } = event;
    const generationId = `gen_${turnId}_${++this.generationCounter}`;
    this.activeGenerations.set(session.callId, generationId);

    this.observeShadowTurn(session, turnId, transcript);
    await this.ctx.streamCoordinator.appendUserUtterance(session, turnId, transcript);
    await this.ctx.sessionStore.save({ ...session, currentTurnId: turnId, generationId });

    if (this.ctx.guardedRoutingCoordinator) {
      const routed = await this.ctx.guardedRoutingCoordinator.routeTurn({
        session,
        turnId,
        generationId,
        callerTranscript: transcript,
        snapshot,
        configurationOrganizationId,
      });
      if (routed.outcome !== 'GENERATIVE') return;
    }

    await this.ctx.streamCoordinator.streamTurn({
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
    await this.ctx.deterministicDeliveryCoordinator!.resolveOnInterruption(
      session,
      event.interruptedUtterance,
    );
    await this.ctx.sessionStore.save({
      ...session,
      currentTurnId: event.turnId,
      generationId: staleGen,
    });
  }
}
