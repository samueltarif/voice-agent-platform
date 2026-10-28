import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  type PgTableExtraConfigValue,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const platformGlobalBudgetLedgers = pgTable(
  'platform_global_budget_ledgers',
  {
    id: text('id').primaryKey(),
    currency: text('currency').notNull().default('USD'),
    allocatedBudgetMinorUnits: integer('allocated_budget_minor_units').notNull().default(0),
    reservedAmountMinorUnits: integer('reserved_amount_minor_units').notNull().default(0),
    spentCarrierMinorUnits: integer('spent_carrier_minor_units').notNull().default(0),
    spentConversationalMinorUnits: integer('spent_conversational_minor_units').notNull().default(0),
    spentAmountMinorUnits: integer('spent_amount_minor_units').notNull().default(0),
    maxConcurrentCalls: integer('max_concurrent_calls').notNull().default(100),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    check('platform_global_budget_allocated_chk', sql`${table.allocatedBudgetMinorUnits} >= 0`),
    check('platform_global_budget_reserved_chk', sql`${table.reservedAmountMinorUnits} >= 0`),
    check('platform_global_budget_spent_carrier_chk', sql`${table.spentCarrierMinorUnits} >= 0`),
    check(
      'platform_global_budget_spent_conversational_chk',
      sql`${table.spentConversationalMinorUnits} >= 0`,
    ),
    check(
      'platform_global_budget_spent_total_chk',
      sql`${table.spentAmountMinorUnits} = ${table.spentCarrierMinorUnits} + ${table.spentConversationalMinorUnits}`,
    ),
    check(
      'platform_global_budget_reserved_le_allocated_chk',
      sql`${table.allocatedBudgetMinorUnits} >= ${table.reservedAmountMinorUnits}`,
    ),
    check('platform_global_budget_concurrency_chk', sql`${table.maxConcurrentCalls} > 0`),
    check('platform_global_budget_version_chk', sql`${table.version} > 0`),
  ],
);

export type PlatformGlobalBudgetLedgerEntity = InferSelectModel<typeof platformGlobalBudgetLedgers>;
