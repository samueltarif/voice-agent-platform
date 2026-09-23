import { relations, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  check,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { organizations } from './organizations.js';

export const agentStatusEnum = pgEnum('agent_status', ['ACTIVE', 'ARCHIVED']);
export const agentVersionStatusEnum = pgEnum('agent_version_status', [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
]);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: agentStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('agents_org_slug_uidx').on(table.organizationId, table.slug),
    unique('agents_id_org_id_unique').on(table.id, table.organizationId),
    index('agents_org_status_idx').on(table.organizationId, table.status),
  ],
);

export const agentVersions = pgTable(
  'agent_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    status: agentVersionStatusEnum('status').notNull().default('DRAFT'),
    configurationSchemaVersion: integer('configuration_schema_version').notNull(),
    configuration: jsonb('configuration').notNull(),
    changelog: text('changelog'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by').references(() => user.id, { onDelete: 'restrict' }),
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
      name: 'agent_versions_agent_org_fk',
    }).onDelete('restrict'),
    uniqueIndex('agent_versions_agent_version_uidx').on(table.agentId, table.versionNumber),
    uniqueIndex('agent_versions_single_draft_uidx')
      .on(table.agentId)
      .where(sql`${table.status} = 'DRAFT'`),
    uniqueIndex('agent_versions_single_published_uidx')
      .on(table.agentId)
      .where(sql`${table.status} = 'PUBLISHED'`),
    check('agent_versions_version_number_chk', sql`${table.versionNumber} > 0`),
    check('agent_versions_config_schema_version_chk', sql`${table.configurationSchemaVersion} > 0`),
    check('agent_versions_config_object_chk', sql`jsonb_typeof(${table.configuration}) = 'object'`),
    check(
      'agent_versions_published_metadata_chk',
      sql`(${table.status} = 'DRAFT' AND ${table.publishedAt} IS NULL AND ${table.publishedBy} IS NULL) OR (${table.status} IN ('PUBLISHED', 'ARCHIVED') AND ${table.publishedAt} IS NOT NULL AND ${table.publishedBy} IS NOT NULL)`,
    ),
    index('agent_versions_org_id_idx').on(table.organizationId),
  ],
);

export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id],
  }),
  versions: many(agentVersions),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentVersions.agentId],
    references: [agents.id],
  }),
  organization: one(organizations, {
    fields: [agentVersions.organizationId],
    references: [organizations.id],
  }),
  creator: one(user, {
    fields: [agentVersions.createdBy],
    references: [user.id],
  }),
  publisher: one(user, {
    fields: [agentVersions.publishedBy],
    references: [user.id],
  }),
}));

export type AgentStatus = (typeof agentStatusEnum.enumValues)[number];
export type AgentVersionStatus = (typeof agentVersionStatusEnum.enumValues)[number];

export type Agent = InferSelectModel<typeof agents>;
export type NewAgent = InferInsertModel<typeof agents>;
export type AgentVersion = InferSelectModel<typeof agentVersions>;
export type NewAgentVersion = InferInsertModel<typeof agentVersions>;
