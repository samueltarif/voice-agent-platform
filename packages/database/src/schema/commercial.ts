import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    billingMode: text('billing_mode').notNull(),
    priceCents: integer('price_cents').notNull().default(0),
    currency: text('currency').notNull().default('BRL'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('plans_code_uidx').on(table.code),
    index('plans_status_idx').on(table.status),
  ],
);

export const entitlements = pgTable(
  'entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    featureKey: text('feature_key').notNull(),
    valueType: text('value_type').notNull(),
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
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    billingMode: text('billing_mode').notNull(),
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
  ],
);

export const commercialGrants = pgTable(
  'commercial_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
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
  (table) => [index('commercial_grants_org_id_idx').on(table.organizationId)],
);

export const plansRelations = relations(plans, ({ many }) => ({
  entitlements: many(entitlements),
  subscriptions: many(subscriptions),
  grants: many(commercialGrants),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  plan: one(plans, {
    fields: [entitlements.planId],
    references: [plans.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const commercialGrantsRelations = relations(commercialGrants, ({ one }) => ({
  organization: one(organizations, {
    fields: [commercialGrants.organizationId],
    references: [organizations.id],
  }),
  plan: one(plans, {
    fields: [commercialGrants.planId],
    references: [plans.id],
  }),
}));
