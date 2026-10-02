import {
  type CallSession,
  type CallSessionStorePort,
  TERMINAL_CALL_SESSION_STATES,
  type VoiceInputEvent,
  type VoiceTransportPort,
} from '@voice-agent/contracts';
import {
  transitionCallSession,
  transitionToTerminalSession,
} from './call-session-state-machine.js';

export interface CallSessionLifecycleCoordinatorDependencies {
  readonly sessionStore: CallSessionStorePort;
  readonly transport: VoiceTransportPort;
  readonly onCallTerminated?: ((organizationId: string, callId: string) => void) | undefined;
}

export class CallSessionLifecycleCoordinator {
  private readonly sessionStore: CallSessionStorePort;
  private readonly transport: VoiceTransportPort;
  private readonly onCallTerminated?:
    ((organizationId: string, callId: string) => void) | undefined;

  constructor(deps: CallSessionLifecycleCoordinatorDependencies) {
    this.sessionStore = deps.sessionStore;
    this.transport = deps.transport;
    this.onCallTerminated = deps.onCallTerminated;
  }

  async handleLifecycleEvent(session: CallSession, event: VoiceInputEvent): Promise<boolean> {
    switch (event.type) {
      case 'transport.connected':
        await this.handleConnected(session);
        return true;
      case 'call.end.requested':
      case 'transport.disconnected':
        await this.handleDisconnect(session, event.reason);
        return true;
      case 'provider.failure':
        await this.handleProviderFailure(session, event.error);
        return true;
      default:
        return false;
    }
  }

  async handleConnected(session: CallSession): Promise<void> {
    const connecting = transitionCallSession(session, 'CONNECTING');
    await this.sessionStore.save(transitionCallSession(connecting, 'ACTIVE'));
  }

  async handleDisconnect(session: CallSession, reason?: string): Promise<void> {
    const isPre = session.runtimeState === 'CONNECTING' || session.runtimeState === 'CREATED';
    await this.handleTerminalState(
      session,
      isPre ? 'FAILED' : 'ENDED',
      reason ? { reason } : undefined,
    );
  }

  async handleProviderFailure(session: CallSession, error?: string): Promise<void> {
    await this.handleTerminalState(
      session,
      'FAILED',
      error !== undefined ? { reason: error } : undefined,
    );
  }

  async handleTerminalState(
    session: CallSession,
    targetState: 'ENDED' | 'FAILED',
    options?: { reason?: string },
  ): Promise<void> {
    if (TERMINAL_CALL_SESSION_STATES.has(session.runtimeState)) return;

    this.onCallTerminated?.(session.organizationId, session.callId);

    const current = transitionToTerminalSession(session, targetState, options?.reason);
    await this.sessionStore.save(current);
    await this.transport.endCall(session.callId, options?.reason);
  }
}
