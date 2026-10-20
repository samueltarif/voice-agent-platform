import type { DatabaseInstance } from '../client/connection.js';
import { DrizzleCallAttemptQueries } from './call-attempt-queries.js';
import {
  applyAttemptEventInTransaction,
  type ApplyAttemptEventInput,
  type DurableApplyOutcome,
} from './durable-attempt-event-applier.js';
import {
  prepareAttemptInTransaction,
  type PrepareDurableAttemptInput,
  type PrepareDurableAttemptResult,
} from './call-attempt-preparation.js';
import {
  claimSendInTransaction,
  completeOriginationInTransaction,
  completeReconciliationInTransaction,
  type ClaimInput,
  type ClaimResult,
  type CompleteInput,
} from './call-attempt-claims.js';
import { claimReconciliationInTransaction } from './call-attempt-reconciliation-claim.js';
import {
  recoverInterruptedAttemptsInTransaction,
  type RecoverInterruptedInput,
  type RecoveryReport,
} from './call-attempt-recovery.js';
import {
  classifyPostgresFailure,
  OutboundPersistenceTechnicalError,
} from './outbound-persistence-errors.js';
import type {
  TelephonyOriginationResult,
  TelephonyReconciliationResult,
} from '@voice-agent/contracts';

const EVENT_ID_CONFLICT: DurableApplyOutcome = { kind: 'EVENT_ID_CONFLICT' };

type TransactionExecutor = Parameters<Parameters<DatabaseInstance['transaction']>[0]>[0];

const PREPARE_CONFLICTS: Readonly<Record<string, PrepareDurableAttemptResult>> = {
  UNIQUE_VIOLATION: { kind: 'BLOCKED', reason: 'CONCURRENT_ATTEMPT_CONFLICT' },
  FOREIGN_KEY_VIOLATION: { kind: 'BLOCKED', reason: 'REFERENCE_REJECTED' },
};

/**
 * Persistência durável e multi-tenant das tentativas (008-OF2). Toda mutação
 * roda em transação própria; nenhuma transação fica aberta durante efeitos
 * externos. Falhas técnicas são propagadas, nunca convertidas em sucesso.
 */
export class DrizzleCallAttemptRepository extends DrizzleCallAttemptQueries {
  constructor(db: DatabaseInstance) {
    super(db);
  }

  async prepareAttempt(input: PrepareDurableAttemptInput): Promise<PrepareDurableAttemptResult> {
    try {
      return await this.db.transaction((tx) => prepareAttemptInTransaction(tx, input));
    } catch (error) {
      const mapped = PREPARE_CONFLICTS[classifyPostgresFailure(error).kind];
      if (mapped) return mapped;
      throw new OutboundPersistenceTechnicalError('prepareAttempt', { cause: error });
    }
  }

  applyEvent(input: ApplyAttemptEventInput): Promise<DurableApplyOutcome> {
    return this.inTransaction(
      'applyEvent',
      (tx) => applyAttemptEventInTransaction(tx, input),
      EVENT_ID_CONFLICT,
    );
  }

  claimSend(input: ClaimInput): Promise<ClaimResult> {
    return this.inTransaction('claimSend', (tx) => claimSendInTransaction(tx, input));
  }

  completeOrigination(input: CompleteInput<TelephonyOriginationResult>) {
    return this.inTransaction(
      'completeOrigination',
      (tx) => completeOriginationInTransaction(tx, input),
      EVENT_ID_CONFLICT,
    );
  }

  claimReconciliation(input: ClaimInput): Promise<ClaimResult> {
    return this.inTransaction('claimReconciliation', (tx) =>
      claimReconciliationInTransaction(tx, input),
    );
  }

  completeReconciliation(input: CompleteInput<TelephonyReconciliationResult>) {
    return this.inTransaction(
      'completeReconciliation',
      (tx) => completeReconciliationInTransaction(tx, input),
      EVENT_ID_CONFLICT,
    );
  }

  recoverInterrupted(input: RecoverInterruptedInput): Promise<RecoveryReport> {
    return this.inTransaction('recoverInterrupted', (tx) =>
      recoverInterruptedAttemptsInTransaction(tx, input),
    );
  }

  /**
   * Corrida de inserção do mesmo `event_id` em tentativas distintas: o índice
   * único decide e o chamador recebe `onEventIdConflict` (nunca "sucesso").
   */
  private async inTransaction<T>(
    operation: string,
    work: (tx: TransactionExecutor) => Promise<T>,
    onEventIdConflict?: T,
  ): Promise<T> {
    try {
      return await this.db.transaction(work);
    } catch (error) {
      const failure = classifyPostgresFailure(error);
      const eventRace = failure.constraint === 'call_events_event_id_uidx';
      if (eventRace && onEventIdConflict !== undefined) return onEventIdConflict;
      throw new OutboundPersistenceTechnicalError(operation, { cause: error });
    }
  }
}
