import { type InferSelectModel } from 'drizzle-orm';
import { foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contactLists } from './contacts.js';
import { outboundCampaigns } from './outbound.js';

/**
 * 008-MVP2 — audiência da campanha (lista da 008-MVP1) e início agendado dos
 * jobs. Tabela própria: `outbound_campaigns` não muda de colunas. Uma lista por
 * campanha; FKs compostas impedem misturar tenants.
 */
export const outboundCampaignAudiences = pgTable(
  'outbound_campaign_audiences',
  {
    campaignId: uuid('campaign_id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    contactListId: uuid('contact_list_id').notNull(),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.campaignId, table.organizationId],
      foreignColumns: [outboundCampaigns.id, outboundCampaigns.organizationId],
      name: 'outbound_campaign_audiences_campaign_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.contactListId, table.organizationId],
      foreignColumns: [contactLists.id, contactLists.organizationId],
      name: 'outbound_campaign_audiences_list_org_fk',
    }).onDelete('restrict'),
  ],
);

export type OutboundCampaignAudienceEntity = InferSelectModel<typeof outboundCampaignAudiences>;
