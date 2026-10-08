import { relations, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { agents, agentVersions } from './agents.js';

export const outboundCampaignStatusEnum = pgEnum('outbound_campaign_status', [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELED',
]);

export const outboundCallJobStatusEnum = pgEnum('outbound_call_job_status', [
  'SCHEDULED',
  'CLAIMED',
  'DISPATCHED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'COMPLETED',
  'CANCELED',
]);

export const outboundCampaigns = pgTable(
  'outbound_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'restrict' }),
    agentVersionId: uuid('agent_version_id')
      .notNull()
      .references(() => agentVersions.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    status: outboundCampaignStatusEnum('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('outbound_campaigns_org_idx').on(table.organizationId),
    index('outbound_campaigns_org_status_idx').on(table.organizationId, table.status),
    check('outbound_campaigns_name_chk', sql`char_length(${table.name}) > 0`),
  ],
);

export const outboundCallJobs = pgTable(
  'outbound_call_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => outboundCampaigns.id, {
      onDelete: 'cascade',
    }),
    agentId: uuid('agent_id').notNull(),
    agentVersionId: uuid('agent_version_id')
      .notNull()
      .references(() => agentVersions.id, { onDelete: 'restrict' }),
    destinationPhone: text('destination_phone').notNull(),
    recipientName: text('recipient_name'),
    status: outboundCallJobStatusEnum('status').notNull().default('SCHEDULED'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: text('claimed_by'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    lastError: text('last_error'),
    idempotencyKey: text('idempotency_key').notNull(),
    callId: uuid('call_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.agentId, table.organizationId],
      foreignColumns: [agents.id, agents.organizationId],
      name: 'outbound_call_jobs_agent_org_fk',
    }).onDelete('restrict'),
    uniqueIndex('outbound_call_jobs_org_idempotency_uidx').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('outbound_call_jobs_org_status_scheduled_idx').on(
      table.organizationId,
      table.status,
      table.scheduledAt,
    ),
    index('outbound_call_jobs_org_campaign_idx').on(table.organizationId, table.campaignId),
    check('outbound_call_jobs_phone_chk', sql`char_length(${table.destinationPhone}) > 0`),
    check('outbound_call_jobs_attempts_chk', sql`${table.attempts} >= 0`),
    check('outbound_call_jobs_max_attempts_chk', sql`${table.maxAttempts} > 0`),
  ],
);

export const outboundCampaignsRelations = relations(outboundCampaigns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [outboundCampaigns.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [outboundCampaigns.agentId],
    references: [agents.id],
  }),
  agentVersion: one(agentVersions, {
    fields: [outboundCampaigns.agentVersionId],
    references: [agentVersions.id],
  }),
  jobs: many(outboundCallJobs),
}));

export const outboundCallJobsRelations = relations(outboundCallJobs, ({ one }) => ({
  organization: one(organizations, {
    fields: [outboundCallJobs.organizationId],
    references: [organizations.id],
  }),
  campaign: one(outboundCampaigns, {
    fields: [outboundCallJobs.campaignId],
    references: [outboundCampaigns.id],
  }),
  agent: one(agents, {
    fields: [outboundCallJobs.agentId],
    references: [agents.id],
  }),
  agentVersion: one(agentVersions, {
    fields: [outboundCallJobs.agentVersionId],
    references: [agentVersions.id],
  }),
}));

export type OutboundCampaignEntity = InferSelectModel<typeof outboundCampaigns>;
export type NewOutboundCampaignEntity = InferInsertModel<typeof outboundCampaigns>;
export type OutboundCallJobEntity = InferSelectModel<typeof outboundCallJobs>;
export type NewOutboundCallJobEntity = InferInsertModel<typeof outboundCallJobs>;
