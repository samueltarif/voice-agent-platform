import type { OutboundBudgetLedger, PlatformGlobalBudgetLedger } from './outbound-budget-types.js';
import type {
  ProvisionGlobalBudgetLedgerInput,
  ProvisionOutboundBudgetLedgerInput,
  ReleaseOutboundBudgetInput,
  ReleaseOutboundBudgetOutcome,
  ReserveOutboundBudgetInput,
  ReserveOutboundBudgetOutcome,
  SettleOutboundBudgetInput,
  SettleOutboundBudgetOutcome,
} from './outbound-budget-operations.js';

export * from './outbound-budget-types.js';
export * from './outbound-budget-operations.js';

export interface OutboundBudgetPort {
  getGlobalLedger(): Promise<PlatformGlobalBudgetLedger | null>;
  provisionGlobalLedger(
    input: ProvisionGlobalBudgetLedgerInput,
  ): Promise<PlatformGlobalBudgetLedger>;
  getLedger(organizationId: string): Promise<OutboundBudgetLedger | null>;
  provisionLedger(input: ProvisionOutboundBudgetLedgerInput): Promise<OutboundBudgetLedger>;
  reserveBudget(input: ReserveOutboundBudgetInput): Promise<ReserveOutboundBudgetOutcome>;
  settleBudget(input: SettleOutboundBudgetInput): Promise<SettleOutboundBudgetOutcome>;
  releaseBudget(input: ReleaseOutboundBudgetInput): Promise<ReleaseOutboundBudgetOutcome>;
}
