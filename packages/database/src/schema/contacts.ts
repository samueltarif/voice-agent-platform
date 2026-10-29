import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { CONTACT_SUPPRESSION_REASONS } from '@voice-agent/contracts';
import { organizations } from './organizations.js';

/** E.164 estrito, idêntico ao padrão de originação (`E164_DESTINATION_PATTERN`). */
const E164_SQL = `'^\\+[1-9][0-9]{7,14}$'`;

/** 008-MVP1 — contato permanente do tenant; um registro por E.164 por organização. */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    displayName: text('display_name'),
    variables: jsonb('variables').$type<Record<string, string>>().notNull().default({}),
    /** Referência opaca da evidência de consentimento, quando aplicável (sem presumir base legal). */
    consentReference: text('consent_reference'),
    consentRecordedAt: timestamp('consent_recorded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('contacts_org_phone_unique').on(table.organizationId, table.phoneE164),
    unique('contacts_id_org_unique').on(table.id, table.organizationId),
    check('contacts_phone_e164_chk', sql`${table.phoneE164} ~ ${sql.raw(E164_SQL)}`),
    check(
      'contacts_name_chk',
      sql`${table.displayName} IS NULL OR char_length(${table.displayName}) <= 500`,
    ),
    check('contacts_variables_chk', sql`jsonb_typeof(${table.variables}) = 'object'`),
    check(
      'contacts_consent_chk',
      sql`${table.consentReference} IS NULL OR char_length(${table.consentReference}) BETWEEN 1 AND 200`,
    ),
  ],
);

export const contactLists = pgTable(
  'contact_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('contact_lists_org_name_unique').on(table.organizationId, table.name),
    unique('contact_lists_id_org_unique').on(table.id, table.organizationId),
    check('contact_lists_name_chk', sql`char_length(${table.name}) BETWEEN 1 AND 120`),
  ],
);

/** Pertinência lista ↔ contato; FKs compostas impedem misturar tenants. */
export const contactListMembers = pgTable(
  'contact_list_members',
  {
    listId: uuid('list_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'contact_list_members_pk', columns: [table.listId, table.contactId] }),
    index('contact_list_members_org_contact_idx').on(table.organizationId, table.contactId),
    foreignKey({
      columns: [table.listId, table.organizationId],
      foreignColumns: [contactLists.id, contactLists.organizationId],
      name: 'contact_list_members_list_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
      name: 'contact_list_members_contact_org_fk',
    }).onDelete('cascade'),
  ],
);

export const contactSuppressionReasonEnum = pgEnum(
  'contact_suppression_reason',
  CONTACT_SUPPRESSION_REASONS,
);

/**
 * Supressão por tenant e E.164. Independe de existir contato: um número
 * suprimido nunca pode virar job (trigger) nem ser enviado (guarda de envio).
 */
export const contactSuppressions = pgTable(
  'contact_suppressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    reason: contactSuppressionReasonEnum('reason').notNull(),
    evidenceReference: text('evidence_reference'),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('contact_suppressions_org_phone_unique').on(table.organizationId, table.phoneE164),
    check('contact_suppressions_phone_e164_chk', sql`${table.phoneE164} ~ ${sql.raw(E164_SQL)}`),
    check(
      'contact_suppressions_evidence_chk',
      sql`${table.evidenceReference} IS NULL OR char_length(${table.evidenceReference}) BETWEEN 1 AND 200`,
    ),
  ],
);

export type ContactEntity = InferSelectModel<typeof contacts>;
export type ContactListEntity = InferSelectModel<typeof contactLists>;
export type ContactSuppressionEntity = InferSelectModel<typeof contactSuppressions>;
