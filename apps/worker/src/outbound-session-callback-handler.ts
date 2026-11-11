import {
  callbackTokenStringSchema,
  evaluateCallLegStatusEvent,
  evaluateProviderReferenceBinding,
  isTerminalCallLegState,
  type AiAgentLegResultEvent,
  type CallbackTokenHasher,
  type CallLegEvent,
  type CallLegStatusEvent,
} from '@voice-agent/contracts';
import type {
  InMemorySessionAttemptStore,
  PreparedSessionRecord,
} from './in-memory-session-attempt-store.js';
import type { OutboundAttemptOriginationCoordinator } from './outbound-attempt-origination-coordinator.js';
import { buildAttemptEvent, type AttemptEventClock } from './outbound-attempt-event-factory.js';
import type { OutboundSessionOrchestrator } from './outbound-session-orchestrator.js';

/**
 * 008-OF5 (S4) — Aplicação de callbacks JÁ AUTENTICADOS pelo adaptador.
 * Tenant e tentativa vêm SOMENTE do hash do token `t` (nunca do payload).
 * Regras: o primeiro `CallSid` vincula por compare-and-set e resolve um
 * desfecho desconhecido sem rediscagem; um `CallSid` diferente é anomalia
 * (alerta e revisão — nunca desligamento automático, DEC-052); eventos
 * duplicados e atrasados não têm efeito.
 */
export type CallbackOutcome =
  'UNKNOWN_TOKEN' | 'QUARANTINED' | 'APPLIED' | 'DUPLICATE' | 'STALE' | 'REJECTED' | 'ANOMALY';

export interface AttemptCallbackContext {
  readonly organizationId: string;
  readonly attemptId: string;
}

export interface IncomingAuthenticatedCallback {
  /** Token `t` lido do URL assinado. */
  readonly callbackToken: string;
  /** Normalizador do adaptador, aplicado SÓ depois de resolver a tentativa. */
  readonly normalize: (context: AttemptCallbackContext) => CallLegEvent | null;
}

export interface CallbackHandlerDependencies extends AttemptEventClock {
  readonly coordinator: OutboundAttemptOriginationCoordinator;
  readonly orchestrator: OutboundSessionOrchestrator;
  readonly store: InMemorySessionAttemptStore;
  readonly hasher: CallbackTokenHasher;
}

export class OutboundSessionCallbackHandler {
  constructor(private readonly deps: CallbackHandlerDependencies) {}

  async receive(callback: IncomingAuthenticatedCallback): Promise<CallbackOutcome> {
    if (!callbackTokenStringSchema.safeParse(callback.callbackToken).success)
      return 'UNKNOWN_TOKEN';
    const record = this.deps.store.findByTokenHash(
      await this.deps.hasher.sha256Hex(callback.callbackToken),
    );
    if (!record) return 'UNKNOWN_TOKEN';
    const event = callback.normalize({
      organizationId: record.organizationId,
      attemptId: record.attemptId,
    });
    if (!event) return 'QUARANTINED';
    if (event.type === 'AI_AGENT_LEG_RESULT') return this.applyLegResult(record, event);
    return this.applyLegStatus(record, event);
  }

  private async applyLegResult(
    record: PreparedSessionRecord,
    event: AiAgentLegResultEvent,
  ): Promise<CallbackOutcome> {
    this.deps.store.saveLegResult(event);
    if (event.bridgeStatus !== 'CONNECTED') await this.endSession(record);
    return 'APPLIED';
  }

  private async applyLegStatus(
    record: PreparedSessionRecord,
    event: CallLegStatusEvent,
  ): Promise<CallbackOutcome> {
    if (event.role === 'CONTACT_LEG') await this.bindIfFirst(record, event.providerLegReference);
    const attempt = this.deps.coordinator.getAttempt(record);
    const decision = evaluateCallLegStatusEvent({
      organizationId: record.organizationId,
      attemptId: record.attemptId,
      contactLegReference: attempt?.providerReference ?? null,
      transferRecorded: false,
      legs: this.deps.store.getLegs(record.organizationId, record.attemptId),
      event,
    });
    if (decision.kind === 'SECOND_CONTACT_REFERENCE') {
      this.deps.store.anomalies.push({
        ...this.refOf(record),
        kind: 'SECOND_CONTACT_REFERENCE',
        assessment: decision.assessment,
      });
      return 'ANOMALY';
    }
    if (decision.kind !== 'APPLY') return decision.kind;
    this.deps.store.saveLeg(decision.leg);
    if (isTerminalCallLegState(decision.leg.state)) await this.onLegEnded(record, event);
    return 'APPLIED';
  }

  /** Compare-and-set do `CallSid`: o callback prova a criação da chamada (sem rediscagem). */
  private async bindIfFirst(record: PreparedSessionRecord, reference: string): Promise<void> {
    const attempt = this.deps.coordinator.getAttempt(record);
    if (!attempt) return;
    const binding = evaluateProviderReferenceBinding({
      attemptState: attempt.state,
      currentReference: attempt.providerReference,
      incomingReference: reference,
    });
    if (binding.kind !== 'BIND') return;
    const extra = { providerReference: reference };
    const event = buildAttemptEvent({
      attempt,
      type: 'ORIGINATION_ACCEPTED',
      clock: this.deps,
      extra,
    });
    await this.deps.coordinator.applyEvent({ ...this.refOf(record), event });
  }

  private async onLegEnded(
    record: PreparedSessionRecord,
    event: CallLegStatusEvent,
  ): Promise<void> {
    if (event.role === 'CONTACT_LEG') {
      const attempt = this.deps.coordinator.getAttempt(record);
      if (attempt) {
        const closed = buildAttemptEvent({
          attempt,
          type: 'CALL_CLOSED_CONFIRMED',
          clock: this.deps,
        });
        await this.deps.coordinator.applyEvent({ ...this.refOf(record), event: closed });
      }
    }
    await this.endSession(record);
  }

  private async endSession(record: PreparedSessionRecord): Promise<void> {
    if (record.sessionState === 'TERMINATED') return;
    await this.deps.orchestrator.terminateSession({
      organizationId: record.organizationId,
      sessionRef: record.sessionRef,
    });
  }

  private refOf(record: PreparedSessionRecord): AttemptCallbackContext {
    return { organizationId: record.organizationId, attemptId: record.attemptId };
  }
}
