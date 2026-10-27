import type { DatabaseInstance } from '../client/connection.js';
import type {
  OutboundBudgetLedger,
  OutboundBudgetPort,
  ProvisionOutboundBudgetLedgerInput,
  ReleaseOutboundBudgetInput,
  ReleaseOutboundBudgetOutcome,
  ReserveOutboundBudgetInput,
  ReserveOutboundBudgetOutcome,
  SettleOutboundBudgetInput,
  SettleOutboundBudgetOutcome,
} from '@voice-agent/contracts';
import {
  findBudgetLedgerByOrganization,
  findReservationByAttemptId,
} from './outbound-budget-queries.js';
import { provisionLedgerInTransaction } from './outbound-budget-provision.js';
import { reserveBudgetInTransaction } from './outbound-budget-reserve.js';
import { settleBudgetInTransaction } from './outbound-budget-settle.js';
import { releaseBudgetInTransaction } from './outbound-budget-release.js';
import {
  classifyPostgresFailure,
  OutboundPersistenceTechnicalError,
} from './outbound-persistence-errors.js';

export class DrizzleOutboundBudgetRepository implements OutboundBudgetPort {
  constructor(private readonly db: DatabaseInstance) {}

  async getLedger(organizationId: string): Promise<OutboundBudgetLedger | null> {
    try {
      return await findBudgetLedgerByOrganization(this.db, organizationId);
    } catch (error) {
      throw new OutboundPersistenceTechnicalError('getLedger', { cause: error });
    }
  }

  async provisionLedger(input: ProvisionOutboundBudgetLedgerInput): Promise<OutboundBudgetLedger> {
    try {
      return await this.db.transaction((tx) => provisionLedgerInTransaction(tx, input));
    } catch (error) {
      throw new OutboundPersistenceTechnicalError('provisionLedger', {
        cause: error,
      });
    }
  }

  async reserveBudget(input: ReserveOutboundBudgetInput): Promise<ReserveOutboundBudgetOutcome> {
    try {
      return await this.db.transaction((tx) => reserveBudgetInTransaction(tx, input));
    } catch (error) {
      const failure = classifyPostgresFailure(error);
      if (
        failure.kind === 'CHECK_VIOLATION' &&
        failure.constraint === 'outbound_budget_ledgers_solvency_chk'
      ) {
        return {
          kind: 'INSUFFICIENT_FUNDS',
          availableMinorUnits: 0,
          requestedMinorUnits: input.estimatedAmountMinorUnits,
          reason: 'Hard budget solvency check rejected negative balance.',
        };
      }
      if (failure.kind === 'UNIQUE_VIOLATION') {
        const existing = await findReservationByAttemptId(
          this.db,
          input.organizationId,
          input.attemptId,
        );
        if (existing) return { kind: 'ALREADY_RESERVED', reservation: existing };
      }
      throw new OutboundPersistenceTechnicalError('reserveBudget', {
        cause: error,
      });
    }
  }

  async settleBudget(input: SettleOutboundBudgetInput): Promise<SettleOutboundBudgetOutcome> {
    try {
      return await this.db.transaction((tx) => settleBudgetInTransaction(tx, input));
    } catch (error) {
      throw new OutboundPersistenceTechnicalError('settleBudget', {
        cause: error,
      });
    }
  }

  async releaseBudget(input: ReleaseOutboundBudgetInput): Promise<ReleaseOutboundBudgetOutcome> {
    try {
      return await this.db.transaction((tx) => releaseBudgetInTransaction(tx, input));
    } catch (error) {
      throw new OutboundPersistenceTechnicalError('releaseBudget', {
        cause: error,
      });
    }
  }
}
