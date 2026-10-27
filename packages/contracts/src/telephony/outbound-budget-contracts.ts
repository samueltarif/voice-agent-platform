import type { OutboundBudgetLedger } from './outbound-budget-types.js';
import type {
  ProvisionOutboundBudgetLedgerInput,
  ReserveOutboundBudgetInput,
  ReserveOutboundBudgetOutcome,
  SettleOutboundBudgetInput,
  SettleOutboundBudgetOutcome,
  ReleaseOutboundBudgetInput,
  ReleaseOutboundBudgetOutcome,
} from './outbound-budget-operations.js';

export * from './outbound-budget-types.js';
export * from './outbound-budget-operations.js';

export interface OutboundBudgetPort {
  getLedger(organizationId: string): Promise<OutboundBudgetLedger | null>;
  provisionLedger(input: ProvisionOutboundBudgetLedgerInput): Promise<OutboundBudgetLedger>;
  reserveBudget(input: ReserveOutboundBudgetInput): Promise<ReserveOutboundBudgetOutcome>;
  settleBudget(input: SettleOutboundBudgetInput): Promise<SettleOutboundBudgetOutcome>;
  releaseBudget(input: ReleaseOutboundBudgetInput): Promise<ReleaseOutboundBudgetOutcome>;
}
