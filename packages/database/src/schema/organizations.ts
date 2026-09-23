import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

export const organizationStatusEnum = pgEnum('organization_status', [
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
]);

export const tenantRoleEnum = pgEnum('tenant_role', [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'OPERATOR',
  'VIEWER',
]);

export const membershipStatusEnum = pgEnum('membership_status', ['INVITED', 'ACTIVE', 'SUSPENDED']);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: organizationStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('organizations_slug_uidx').on(table.slug),
    index('organizations_status_idx').on(table.status),
  ],
);

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    role: tenantRoleEnum('role').notNull(),
    status: membershipStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('org_memberships_org_user_uidx').on(table.organizationId, table.userId),
    index('org_memberships_user_id_idx').on(table.userId),
    index('org_memberships_org_id_idx').on(table.organizationId),
  ],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(organizationMemberships),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMemberships.organizationId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [organizationMemberships.userId],
    references: [user.id],
  }),
}));

export type OrganizationStatus = (typeof organizationStatusEnum.enumValues)[number];
export type TenantRole = (typeof tenantRoleEnum.enumValues)[number];
export type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number];
