import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const billingModeEnum = pgEnum('billing_mode', ['SELF_SERVICE', 'MANUAL', 'COMPLIMENTARY']);
export const planStatusEnum = pgEnum('plan_status', ['ACTIVE', 'ARCHIVED']);
export const entitlementValueTypeEnum = pgEnum('entitlement_value_type', [
  'BOOLEAN',
  'NUMERIC',
  'STRING',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELED',
  'EXPIRED',
]);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    billingMode: billingModeEnum('billing_mode').notNull(),
    priceCents: integer('price_cents').notNull().default(0),
    currency: text('currency').notNull().default('BRL'),
    status: planStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('plans_code_uidx').on(table.code),
    index('plans_status_idx').on(table.status),
    check('plans_price_cents_chk', sql`${table.priceCents} >= 0`),
  ],
);

export const entitlements = pgTable(
  'entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    featureKey: text('feature_key').notNull(),
    valueType: entitlementValueTypeEnum('value_type').notNull(),
    booleanValue: boolean('boolean_value'),
    numericLimit: integer('numeric_limit'),
    stringValue: text('string_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('entitlements_plan_feature_uidx').on(table.planId, table.featureKey),
    index('entitlements_feature_key_idx').on(table.featureKey),
    check(
      'entitlements_value_integrity_chk',
      sql`(${table.valueType} = 'BOOLEAN' AND ${table.booleanValue} IS NOT NULL AND ${table.numericLimit} IS NULL AND ${table.stringValue} IS NULL) OR (${table.valueType} = 'NUMERIC' AND ${table.numericLimit} IS NOT NULL AND ${table.numericLimit} >= 0 AND ${table.booleanValue} IS NULL AND ${table.stringValue} IS NULL) OR (${table.valueType} = 'STRING' AND ${table.stringValue} IS NOT NULL AND ${table.booleanValue} IS NULL AND ${table.numericLimit} IS NULL)`,
    ),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: subscriptionStatusEnum('status').notNull(),
    billingMode: billingModeEnum('billing_mode').notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('subscriptions_org_status_idx').on(table.organizationId, table.status),
    index('subscriptions_status_idx').on(table.status),
    check('subscriptions_period_chk', sql`${table.currentPeriodEnd} > ${table.currentPeriodStart}`),
  ],
);

export const commercialGrants = pgTable(
  'commercial_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'restrict' }),
    featureKey: text('feature_key'),
    overrideValue: text('override_value'),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    grantedBy: text('granted_by').notNull(),
    reason: text('reason').notNull(),
    reference: text('reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('commercial_grants_org_id_idx').on(table.organizationId),
    check(
      'commercial_grants_effect_chk',
      sql`(${table.planId} IS NOT NULL) OR (${table.featureKey} IS NOT NULL AND ${table.overrideValue} IS NOT NULL)`,
    ),
    check(
      'commercial_grants_period_chk',
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const plansRelations = relations(plans, ({ many }) => ({
  entitlements: many(entitlements),
  subscriptions: many(subscriptions),
  grants: many(commercialGrants),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  plan: one(plans, { fields: [entitlements.planId], references: [plans.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));

export const commercialGrantsRelations = relations(commercialGrants, ({ one }) => ({
  organization: one(organizations, {
    fields: [commercialGrants.organizationId],
    references: [organizations.id],
  }),
  plan: one(plans, { fields: [commercialGrants.planId], references: [plans.id] }),
}));

export type BillingMode = (typeof billingModeEnum.enumValues)[number];
export type PlanStatus = (typeof planStatusEnum.enumValues)[number];
export type EntitlementValueType = (typeof entitlementValueTypeEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
