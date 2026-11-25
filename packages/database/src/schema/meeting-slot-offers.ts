import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { callAttempts } from './call-attempts.js';
import { leads } from './leads.js';
import { organizations } from './organizations.js';
import { schedulingCalendars } from './scheduling-calendars.js';

export const meetingSlotOfferStatusEnum = pgEnum('meeting_slot_offer_status', [
  'OFFERED',
  'ACCEPTED',
]);

/**
 * E1 (DEC-074) — horário EFETIVAMENTE oferecido a um lead (base da futura
 * confirmação pelo agente: a reserva aponta para a oferta, não para um
 * horário informado pelo modelo). Expira em `expires_at`.
 */
export const meetingSlotOffers = pgTable(
  'meeting_slot_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    sourceAttemptId: uuid('source_attempt_id'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: meetingSlotOfferStatusEnum('status').notNull().default('OFFERED'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('meeting_slot_offers_id_org_unique').on(table.id, table.organizationId),
    foreignKey({
      columns: [table.calendarId, table.organizationId],
      foreignColumns: [schedulingCalendars.id, schedulingCalendars.organizationId],
      name: 'meeting_slot_offers_calendar_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.leadId, table.organizationId],
      foreignColumns: [leads.id, leads.organizationId],
      name: 'meeting_slot_offers_lead_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sourceAttemptId, table.organizationId],
      foreignColumns: [callAttempts.id, callAttempts.organizationId],
      name: 'meeting_slot_offers_attempt_org_fk',
    }).onDelete('no action'),
    index('meeting_slot_offers_org_lead_created_idx').on(
      table.organizationId,
      table.leadId,
      table.createdAt,
    ),
    check('meeting_slot_offers_interval_chk', sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export type MeetingSlotOfferEntity = InferSelectModel<typeof meetingSlotOffers>;
