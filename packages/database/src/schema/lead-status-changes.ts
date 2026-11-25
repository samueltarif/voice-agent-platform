import { sql, type InferSelectModel } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  leads,
  leadStatusChangeOriginEnum,
  leadStatusEnum,
  schedulingActorTypeEnum,
} from './leads.js';
import { meetings } from './meetings.js';
import { organizations } from './organizations.js';

/**
 * Histórico das mudanças de status do lead. CONTEÚDO imutável no banco: a
 * migration instala um gatilho que recusa UPDATE. Exclusão continua possível
 * só pela remoção em cascata do lead ou da organização (política de exclusão
 * de dados); a aplicação nunca apaga linhas do histórico.
 * `meeting_id` só aponta para reunião existente da MESMA organização.
 */
export const leadStatusChanges = pgTable(
  'lead_status_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull(),
    fromStatus: leadStatusEnum('from_status'),
    toStatus: leadStatusEnum('to_status').notNull(),
    origin: leadStatusChangeOriginEnum('origin').notNull(),
    actorType: schedulingActorTypeEnum('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    reason: text('reason'),
    meetingId: uuid('meeting_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.leadId, table.organizationId],
      foreignColumns: [leads.id, leads.organizationId],
      name: 'lead_status_changes_lead_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetings.id, meetings.organizationId],
      name: 'lead_status_changes_meeting_org_fk',
    }).onDelete('no action'),
    index('lead_status_changes_org_lead_created_idx').on(
      table.organizationId,
      table.leadId,
      table.createdAt,
    ),
    check(
      'lead_status_changes_reason_chk',
      sql`${table.reason} IS NULL OR char_length(${table.reason}) BETWEEN 1 AND 500`,
    ),
    check('lead_status_changes_actor_chk', sql`char_length(${table.actorId}) BETWEEN 1 AND 200`),
  ],
);

export type LeadStatusChangeEntity = InferSelectModel<typeof leadStatusChanges>;
