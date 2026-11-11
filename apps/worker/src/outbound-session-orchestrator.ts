import {
  evaluatePreparationValidity,
  generateCallbackToken,
  hashCallbackToken,
  type ConversationSessionPreparation,
  type TelephonyOriginationRequest,
} from '@voice-agent/contracts';
import type { AttemptRef } from './outbound-attempt-coordinator-types.js';
import { evaluateOutboundSessionGate } from './outbound-session-gate.js';
import type {
  DialContext,
  NotSentReason,
  OutboundSessionOrchestratorDependencies,
  StartOutboundSessionInput,
  StartOutboundSessionResult,
} from './outbound-session-orchestrator-types.js';

type Prepared = Extract<ConversationSessionPreparation, { kind: 'PREPARED' }>;

/**
 * 008-OF5 (S4) — Orquestração OFFLINE de UMA tentativa Twilio-led:
 * portão → tentativa (FSM 008-OF1) → sessão conversacional → write-ahead da
 * sessão e do hash do token → originação (autoridade única) → desfecho.
 * Nunca rediscagem: falha ambígua fica em OUTCOME_UNKNOWN para reconciliação.
 * Não é worker ativo e não tem composição de runtime.
 */
export class OutboundSessionOrchestrator {
  private readonly dialContexts = new Map<string, DialContext>();

  constructor(private readonly deps: OutboundSessionOrchestratorDependencies) {}

  /** Usado pelo adaptador de telefonia: entrega o contexto UMA vez (consumo único). */
  async takeDialContext(request: TelephonyOriginationRequest): Promise<DialContext | null> {
    const id = `${request.organizationId}:${request.attemptId}`;
    const context = this.dialContexts.get(id) ?? null;
    this.dialContexts.delete(id);
    return context;
  }

  async start(input: StartOutboundSessionInput): Promise<StartOutboundSessionResult> {
    const gate = evaluateOutboundSessionGate(input.gate);
    if (!gate.allowed) return { kind: 'NOT_SENT', reason: 'GATE_BLOCKED', detail: gate.reason };
    const prepared = await this.deps.coordinator.prepareAttempt(input.attempt);
    if (prepared.kind !== 'PREPARED') {
      return { kind: 'NOT_SENT', reason: 'ATTEMPT_BLOCKED', detail: prepared.reason };
    }
    const ref = {
      organizationId: input.attempt.organizationId,
      attemptId: input.attempt.attemptId,
    };
    const session = await this.prepareSession(input);
    if (session.kind === 'UNAVAILABLE') return this.abandon(ref, null, 'SESSION_UNAVAILABLE');
    const refusal = this.refusalFor(session);
    if (refusal) return this.abandon(ref, session.sessionRef, refusal);
    const token = generateCallbackToken(this.deps.entropy);
    const saved = this.deps.store.savePreparation({
      ...ref,
      sessionRef: session.sessionRef,
      sipUri: session.mediaTarget.kind === 'SIP_URI' ? session.mediaTarget.uri : '',
      expiresAt: session.expiresAt,
      preparedAt: this.deps.now().toISOString(),
      callbackTokenHash: await hashCallbackToken(token, this.deps.hasher),
      sessionState: 'PREPARED',
    });
    if (!saved) return this.abandon(ref, session.sessionRef, 'PREPARATION_NOT_PERSISTED');
    return this.dial(input, session, token.reveal());
  }

  private async prepareSession(
    input: StartOutboundSessionInput,
  ): Promise<ConversationSessionPreparation> {
    const { attempt } = input;
    try {
      return await this.deps.conversation.prepare({
        organizationId: attempt.organizationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        agentVersionId: attempt.agentVersionId,
      });
    } catch {
      return { kind: 'UNAVAILABLE', reason: 'PROVIDER_DOWN' };
    }
  }

  private refusalFor(session: Prepared): NotSentReason | null {
    if (session.mediaTarget.kind !== 'SIP_URI') return 'UNSUPPORTED_MEDIA_TARGET';
    const validity = evaluatePreparationValidity(session, this.deps.now());
    if (validity === 'EXPIRED') return 'SESSION_EXPIRED';
    if (validity === 'VALID') return null;
    return this.deps.unknownValidity === 'REFUSE' ? 'SESSION_VALIDITY_UNKNOWN' : null;
  }

  private async dial(
    input: StartOutboundSessionInput,
    session: Prepared,
    callbackToken: string,
  ): Promise<StartOutboundSessionResult> {
    const ref = {
      organizationId: input.attempt.organizationId,
      attemptId: input.attempt.attemptId,
    };
    const sipUri = session.mediaTarget.kind === 'SIP_URI' ? session.mediaTarget.uri : '';
    this.dialContexts.set(`${ref.organizationId}:${ref.attemptId}`, {
      callerId: input.callerId,
      sipUri,
      callbackToken,
    });
    const outcome = await this.deps.coordinator.originate({
      ...ref,
      destination: input.destination,
    });
    this.dialContexts.delete(`${ref.organizationId}:${ref.attemptId}`);
    if (outcome.kind === 'NOT_SENT')
      return this.abandon(ref, session.sessionRef, 'ORIGINATION_NOT_SENT');
    return this.afterOrigination(ref, session.sessionRef);
  }

  private async afterOrigination(
    ref: AttemptRef,
    sessionRef: string,
  ): Promise<StartOutboundSessionResult> {
    const attempt = this.deps.coordinator.getAttempt(ref);
    if (attempt?.state === 'ORIGINATION_REJECTED') {
      return this.abandon(ref, sessionRef, 'ORIGINATION_REJECTED');
    }
    this.deps.store.setBudgetDisposition(
      ref.organizationId,
      ref.attemptId,
      'PENDING_RECONCILIATION',
    );
    if (attempt?.state === 'ORIGINATION_ACCEPTED' || attempt?.state === 'CLOSED') {
      return { kind: 'SENT', providerReference: attempt.providerReference };
    }
    return { kind: 'OUTCOME_UNKNOWN' };
  }

  /** Nada foi discado (ou a operadora recusou): encerra a sessão e libera a reserva. */
  private async abandon(
    ref: AttemptRef,
    sessionRef: string | null,
    reason: NotSentReason,
  ): Promise<StartOutboundSessionResult> {
    if (sessionRef) await this.terminateSession({ organizationId: ref.organizationId, sessionRef });
    await this.deps.coordinator.cancelBeforeSend(ref);
    this.deps.store.setBudgetDisposition(ref.organizationId, ref.attemptId, 'RELEASE');
    return { kind: 'NOT_SENT', reason };
  }

  async terminateSession(ref: { organizationId: string; sessionRef: string }): Promise<void> {
    let result: string;
    try {
      result = await this.deps.conversation.terminate(ref);
    } catch {
      result = 'UNKNOWN';
    }
    const record = this.deps.store
      .listPreparations(ref.organizationId)
      .find((candidate) => candidate.sessionRef === ref.sessionRef);
    if (record)
      record.sessionState = result === 'UNKNOWN' ? 'TERMINATION_UNCONFIRMED' : 'TERMINATED';
  }
}
