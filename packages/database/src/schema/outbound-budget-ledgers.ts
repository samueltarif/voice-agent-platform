import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  type PgTableExtraConfigValue,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const outboundBudgetLedgers = pgTable(
  'outbound_budget_ledgers',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    currency: text('currency').notNull().default('USD'),
    allocatedBudgetMinorUnits: integer('allocated_budget_minor_units').notNull().default(0),
    reservedAmountMinorUnits: integer('reserved_amount_minor_units').notNull().default(0),
    spentCarrierMinorUnits: integer('spent_carrier_minor_units').notNull().default(0),
    spentConversationalMinorUnits: integer('spent_conversational_minor_units').notNull().default(0),
    spentAmountMinorUnits: integer('spent_amount_minor_units').notNull().default(0),
    maxConcurrentCalls: integer('max_concurrent_calls').notNull().default(5),
    maxDailyAttempts: integer('max_daily_attempts').notNull().default(50),
    timezone: text('timezone').notNull().default('UTC'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    unique('outbound_budget_ledgers_org_unique').on(table.organizationId),
    unique('outbound_budget_ledgers_id_org_unique').on(table.id, table.organizationId),
    check('outbound_budget_ledgers_allocated_chk', sql`${table.allocatedBudgetMinorUnits} >= 0`),
    check('outbound_budget_ledgers_reserved_chk', sql`${table.reservedAmountMinorUnits} >= 0`),
    check('outbound_budget_ledgers_spent_carrier_chk', sql`${table.spentCarrierMinorUnits} >= 0`),
    check(
      'outbound_budget_ledgers_spent_conversational_chk',
      sql`${table.spentConversationalMinorUnits} >= 0`,
    ),
    check(
      'outbound_budget_ledgers_spent_total_chk',
      sql`${table.spentAmountMinorUnits} = ${table.spentCarrierMinorUnits} + ${table.spentConversationalMinorUnits}`,
    ),
    check(
      'outbound_budget_ledgers_reserved_le_allocated_chk',
      sql`${table.allocatedBudgetMinorUnits} >= ${table.reservedAmountMinorUnits}`,
    ),
    check('outbound_budget_ledgers_concurrency_chk', sql`${table.maxConcurrentCalls} > 0`),
    check('outbound_budget_ledgers_daily_quota_chk', sql`${table.maxDailyAttempts} > 0`),
    check('outbound_budget_ledgers_version_chk', sql`${table.version} > 0`),
  ],
);

export type OutboundBudgetLedgerEntity = InferSelectModel<typeof outboundBudgetLedgers>;
