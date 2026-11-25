import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  LEAD_STATUS_CHANGE_ORIGINS,
  LEAD_STATUSES,
  SCHEDULING_ACTOR_TYPES,
} from '@voice-agent/contracts';
import { contacts } from './contacts.js';
import { organizations } from './organizations.js';

export const leadStatusEnum = pgEnum('lead_status', LEAD_STATUSES);
export const leadStatusChangeOriginEnum = pgEnum(
  'lead_status_change_origin',
  LEAD_STATUS_CHANGE_ORIGINS,
);
export const schedulingActorTypeEnum = pgEnum('scheduling_actor_type', SCHEDULING_ACTOR_TYPES);

/**
 * E1 (DEC-074) — lead comercial: UM por contato e organização. Nome e
 * telefone continuam só em `contacts` (sem duplicação); o vínculo composto
 * impede apontar para contato de outro tenant.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull(),
    status: leadStatusEnum('status').notNull().default('NEW'),
    statusVersion: integer('status_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('leads_org_contact_unique').on(table.organizationId, table.contactId),
    unique('leads_id_org_unique').on(table.id, table.organizationId),
    foreignKey({
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
      name: 'leads_contact_org_fk',
    }).onDelete('restrict'),
    index('leads_org_status_updated_idx').on(table.organizationId, table.status, table.updatedAt),
    check('leads_status_version_chk', sql`${table.statusVersion} > 0`),
  ],
);

export type LeadEntity = InferSelectModel<typeof leads>;
