import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  type PgTableExtraConfigValue,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { OUTBOUND_BUDGET_RESERVATION_STATUSES } from '@voice-agent/contracts';
import { organizations } from './organizations.js';
import { callAttempts } from './call-attempts.js';
import { outboundCallJobs } from './outbound.js';

export const outboundBudgetReservationStatusEnum = pgEnum(
  'outbound_budget_reservation_status',
  OUTBOUND_BUDGET_RESERVATION_STATUSES,
);

export const outboundBudgetReservations = pgTable(
  'outbound_budget_reservations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    attemptId: uuid('attempt_id').notNull(),
    jobId: uuid('job_id').notNull(),
    reservedAmountMinorUnits: integer('reserved_amount_minor_units').notNull(),
    reservedCarrierMinorUnits: integer('reserved_carrier_minor_units').notNull().default(0),
    reservedConversationalMinorUnits: integer('reserved_conversational_minor_units')
      .notNull()
      .default(0),
    settledCarrierMinorUnits: integer('settled_carrier_minor_units').notNull().default(0),
    settledConversationalMinorUnits: integer('settled_conversational_minor_units')
      .notNull()
      .default(0),
    settledAmountMinorUnits: integer('settled_amount_minor_units').notNull().default(0),
    status: outboundBudgetReservationStatusEnum('status').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    releaseReason: text('release_reason'),
    reservedAt: timestamp('reserved_at', { withTimezone: true }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.attemptId, table.organizationId],
      foreignColumns: [callAttempts.id, callAttempts.organizationId],
      name: 'outbound_budget_res_attempt_org_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.jobId, table.organizationId],
      foreignColumns: [outboundCallJobs.id, outboundCallJobs.organizationId],
      name: 'outbound_budget_res_job_org_fk',
    }).onDelete('no action'),
    unique('outbound_budget_res_id_org_unique').on(table.id, table.organizationId),
    uniqueIndex('outbound_budget_res_org_attempt_uidx').on(table.organizationId, table.attemptId),
    uniqueIndex('outbound_budget_res_org_idempotency_uidx').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('outbound_budget_res_org_status_idx').on(table.organizationId, table.status),
    check('outbound_budget_res_reserved_chk', sql`${table.reservedAmountMinorUnits} > 0`),
    check('outbound_budget_res_reserved_carrier_chk', sql`${table.reservedCarrierMinorUnits} >= 0`),
    check(
      'outbound_budget_res_reserved_conversational_chk',
      sql`${table.reservedConversationalMinorUnits} >= 0`,
    ),
    check('outbound_budget_res_settled_carrier_chk', sql`${table.settledCarrierMinorUnits} >= 0`),
    check(
      'outbound_budget_res_settled_conversational_chk',
      sql`${table.settledConversationalMinorUnits} >= 0`,
    ),
    check(
      'outbound_budget_res_settled_total_chk',
      sql`${table.settledAmountMinorUnits} = ${table.settledCarrierMinorUnits} + ${table.settledConversationalMinorUnits}`,
    ),
    check(
      'outbound_budget_res_status_settled_chk',
      sql`(${table.status} != 'COMMITTED') OR (${table.settledAt} IS NOT NULL)`,
    ),
    check(
      'outbound_budget_res_status_released_chk',
      sql`(${table.status} != 'RELEASED') OR (${table.releasedAt} IS NOT NULL)`,
    ),
  ],
);

export type OutboundBudgetReservationEntity = InferSelectModel<typeof outboundBudgetReservations>;
