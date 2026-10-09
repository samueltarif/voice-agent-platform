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
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { agents, agentVersions } from './agents.js';

export const knowledgeDocumentStatusEnum = pgEnum('knowledge_document_status', [
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'ARCHIVED',
]);

export const knowledgeSourceTypeEnum = pgEnum('knowledge_source_type', [
  'MANUAL_UPLOAD',
  'PRODUCT_MANUAL',
  'FAQ',
  'POLICY',
  'SALES_SCRIPT',
  'HELP_CENTER_IMPORT',
  'OTHER',
]);

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceType: knowledgeSourceTypeEnum('source_type').notNull(),
    sourceLocator: text('source_locator').notNull(),
    sourceVersion: text('source_version'),
    contentIdentityAlgorithm: text('content_identity_algorithm'),
    contentIdentityValue: text('content_identity_value'),
    status: knowledgeDocumentStatusEnum('status').notNull().default('PENDING'),
    collection: text('collection'),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentVersionId: uuid('agent_version_id').references(() => agentVersions.id, {
      onDelete: 'set null',
    }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_docs_org_source_uidx').on(
      table.organizationId,
      table.sourceType,
      table.sourceLocator,
    ),
    index('knowledge_docs_org_idx').on(table.organizationId),
    index('knowledge_docs_org_status_idx').on(table.organizationId, table.status),
    index('knowledge_docs_org_content_ident_idx').on(
      table.organizationId,
      table.contentIdentityValue,
    ),
    index('knowledge_docs_org_collection_idx').on(table.organizationId, table.collection),
    check('knowledge_docs_title_chk', sql`char_length(${table.title}) > 0`),
    check('knowledge_docs_locator_chk', sql`char_length(${table.sourceLocator}) > 0`),
  ],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    policyVersion: text('policy_version').notNull(),
    contentIdentityValue: text('content_identity_value'),
    chunkIdentity: text('chunk_identity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_chunks_doc_ordinal_uidx').on(table.documentId, table.ordinal),
    uniqueIndex('knowledge_chunks_doc_chunk_ident_uidx').on(table.documentId, table.chunkIdentity),
    index('knowledge_chunks_org_doc_idx').on(table.organizationId, table.documentId),
    index('knowledge_chunks_org_idx').on(table.organizationId),
    check('knowledge_chunks_ordinal_chk', sql`${table.ordinal} >= 0`),
    check('knowledge_chunks_text_chk', sql`char_length(${table.text}) > 0`),
  ],
);

export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [knowledgeDocuments.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [knowledgeDocuments.agentId],
    references: [agents.id],
  }),
  agentVersion: one(agentVersions, {
    fields: [knowledgeDocuments.agentVersionId],
    references: [agentVersions.id],
  }),
  chunks: many(knowledgeChunks),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  organization: one(organizations, {
    fields: [knowledgeChunks.organizationId],
    references: [organizations.id],
  }),
  document: one(knowledgeDocuments, {
    fields: [knowledgeChunks.documentId],
    references: [knowledgeDocuments.id],
  }),
}));

export type KnowledgeDocumentEntity = InferSelectModel<typeof knowledgeDocuments>;
export type NewKnowledgeDocumentEntity = InferInsertModel<typeof knowledgeDocuments>;
export type KnowledgeChunkEntity = InferSelectModel<typeof knowledgeChunks>;
export type NewKnowledgeChunkEntity = InferInsertModel<typeof knowledgeChunks>;
