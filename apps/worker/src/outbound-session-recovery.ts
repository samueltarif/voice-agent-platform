import type {
  InMemorySessionAttemptStore,
  PreparedSessionRecord,
} from './in-memory-session-attempt-store.js';
import type { AttemptRef } from './outbound-attempt-coordinator-types.js';
import type { OutboundAttemptOriginationCoordinator } from './outbound-attempt-origination-coordinator.js';
import type { CallControlPort } from './outbound-session-orchestrator-types.js';
import type { OutboundSessionOrchestrator } from './outbound-session-orchestrator.js';

/**
 * 008-OF5 (S4) — Encerramento forçado (kill switch) e recuperação pós-crash.
 * Ordem do encerramento: perna telefônica primeiro, depois a sessão
 * conversacional. A recuperação NUNCA redisca: tentativas interrompidas viram
 * OUTCOME_UNKNOWN e são reconciliadas por consulta.
 */
export interface OutboundSessionRecoveryDependencies {
  readonly coordinator: OutboundAttemptOriginationCoordinator;
  readonly orchestrator: OutboundSessionOrchestrator;
  readonly store: InMemorySessionAttemptStore;
  readonly callControl: CallControlPort;
}

export type ForceEndTelephony = 'ENDED' | 'NOT_FOUND' | 'UNKNOWN' | 'NO_REFERENCE';

export interface RecoveryReport {
  readonly interruptedToUnknown: number;
  readonly reconciled: number;
  readonly sessionsTerminated: number;
}

const NEVER_SENT = new Set(['CREATED', 'ORIGINATION_PENDING']);
const TERMINAL = new Set(['CLOSED', 'ORIGINATION_REJECTED', 'NOT_ORIGINATED', 'CANCELED']);

export class OutboundSessionRecovery {
  constructor(private readonly deps: OutboundSessionRecoveryDependencies) {}

  async forceEnd(ref: AttemptRef): Promise<ForceEndTelephony> {
    const reference = this.deps.coordinator.getAttempt(ref)?.providerReference ?? null;
    let telephony: ForceEndTelephony = 'NO_REFERENCE';
    if (reference) {
      try {
        telephony = await this.deps.callControl.hangUp(reference);
      } catch {
        telephony = 'UNKNOWN';
      }
    }
    const record = this.deps.store.getPreparation(ref.organizationId, ref.attemptId);
    if (record) await this.terminate(record);
    return telephony;
  }

  async recoverAfterCrash(organizationId: string): Promise<RecoveryReport> {
    const interrupted = await this.deps.coordinator.recoverInterruptedAttempts(organizationId);
    let reconciled = 0;
    let sessionsTerminated = 0;
    for (const record of this.deps.store.listPreparations(organizationId)) {
      if (record.sessionState === 'TERMINATED') continue;
      const outcome = await this.recoverOne(record);
      if (outcome.reconciled) reconciled += 1;
      if (outcome.terminated) sessionsTerminated += 1;
    }
    return { interruptedToUnknown: interrupted, reconciled, sessionsTerminated };
  }

  private async recoverOne(
    record: PreparedSessionRecord,
  ): Promise<{ readonly reconciled: boolean; readonly terminated: boolean }> {
    const state = this.deps.coordinator.getAttempt(record)?.state;
    if (state && NEVER_SENT.has(state)) {
      await this.deps.coordinator.cancelBeforeSend(record);
      this.deps.store.setBudgetDisposition(record.organizationId, record.attemptId, 'RELEASE');
      return { reconciled: false, terminated: await this.terminate(record) };
    }
    if (state === 'OUTCOME_UNKNOWN') return this.reconcileUnknown(record);
    const terminal = state !== undefined && TERMINAL.has(state);
    return { reconciled: false, terminated: terminal && (await this.terminate(record)) };
  }

  /** Consulta a operadora; só encerra a sessão quando a NÃO originação é confirmada. */
  private async reconcileUnknown(
    record: PreparedSessionRecord,
  ): Promise<{ readonly reconciled: boolean; readonly terminated: boolean }> {
    await this.deps.coordinator.reconcile(record);
    const after = this.deps.coordinator.getAttempt(record)?.state;
    return {
      reconciled: true,
      terminated: after === 'NOT_ORIGINATED' && (await this.terminate(record)),
    };
  }

  private async terminate(record: PreparedSessionRecord): Promise<boolean> {
    await this.deps.orchestrator.terminateSession({
      organizationId: record.organizationId,
      sessionRef: record.sessionRef,
    });
    return record.sessionState === 'TERMINATED';
  }
}
