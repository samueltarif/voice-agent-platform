import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

export const platformAdminAuthorizations = pgTable(
  'platform_admin_authorizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('ACTIVE'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    grantedBy: text('granted_by').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: text('revoked_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('platform_admin_user_status_idx').on(table.userId, table.status),
    index('platform_admin_status_idx').on(table.status),
  ],
);

export const platformAdminAuthorizationsRelations = relations(
  platformAdminAuthorizations,
  ({ one }) => ({
    user: one(user, {
      fields: [platformAdminAuthorizations.userId],
      references: [user.id],
    }),
  }),
);
