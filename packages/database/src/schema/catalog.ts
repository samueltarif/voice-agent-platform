import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { uniqueIndex, index, pgEnum, check } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const catalogItemKindEnum = pgEnum('catalog_item_kind', ['PRODUCT', 'SERVICE']);

export const catalogItems = pgTable(
  'catalog_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    kind: catalogItemKindEnum('kind').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    sku: text('sku'),
    active: boolean('active').notNull().default(true),
    priceCents: integer('price_cents'),
    currency: text('currency').notNull().default('BRL'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('catalog_items_org_sku_uidx').on(table.organizationId, table.sku),
    index('catalog_items_org_active_idx').on(table.organizationId, table.active),
    index('catalog_items_org_kind_active_idx').on(table.organizationId, table.kind, table.active),
    index('catalog_items_org_name_idx').on(table.organizationId, table.name),
    check('catalog_items_name_chk', sql`char_length(${table.name}) > 0`),
    check(
      'catalog_items_price_cents_chk',
      sql`${table.priceCents} IS NULL OR ${table.priceCents} >= 0`,
    ),
    check('catalog_items_currency_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const catalogItemsRelations = relations(catalogItems, ({ one }) => ({
  organization: one(organizations, {
    fields: [catalogItems.organizationId],
    references: [organizations.id],
  }),
}));

export type CatalogItemKind = (typeof catalogItemKindEnum.enumValues)[number];
