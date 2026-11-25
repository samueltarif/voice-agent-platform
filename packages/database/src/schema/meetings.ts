import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { MEETING_STATUSES } from '@voice-agent/contracts';
import { callAttempts } from './call-attempts.js';
import { leads, schedulingActorTypeEnum } from './leads.js';
import { organizations } from './organizations.js';
import { meetingSlotOffers } from './meeting-slot-offers.js';
import { schedulingCalendars } from './scheduling-calendars.js';

export const meetingStatusEnum = pgEnum('meeting_status', MEETING_STATUSES);
/**
 * Reunião marcada. Garantias no banco: chave de idempotência única por
 * organização; no máximo UMA reunião ativa por lead e por tentativa de
 * ligação; e (na migration, via `btree_gist`) nenhuma sobreposição de
 * reuniões ativas na mesma agenda.
 */
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: meetingStatusEnum('status').notNull().default('SCHEDULED'),
    version: integer('version').notNull().default(1),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    sourceAttemptId: uuid('source_attempt_id'),
    slotOfferId: uuid('slot_offer_id'),
    bookedByType: schedulingActorTypeEnum('booked_by_type').notNull(),
    bookedById: text('booked_by_id').notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    canceledByType: schedulingActorTypeEnum('canceled_by_type'),
    canceledById: text('canceled_by_id'),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('meetings_id_org_unique').on(table.id, table.organizationId),
    unique('meetings_org_idempotency_unique').on(table.organizationId, table.idempotencyKey),
    uniqueIndex('meetings_one_active_per_lead_uidx')
      .on(table.organizationId, table.leadId)
      .where(sql`${table.status} = 'SCHEDULED'`),
    uniqueIndex('meetings_one_active_per_attempt_uidx')
      .on(table.organizationId, table.sourceAttemptId)
      .where(sql`${table.status} = 'SCHEDULED' AND ${table.sourceAttemptId} IS NOT NULL`),
    uniqueIndex('meetings_slot_offer_uidx')
      .on(table.slotOfferId)
      .where(sql`${table.slotOfferId} IS NOT NULL`),
    foreignKey({
      columns: [table.calendarId, table.organizationId],
      foreignColumns: [schedulingCalendars.id, schedulingCalendars.organizationId],
      name: 'meetings_calendar_org_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.leadId, table.organizationId],
      foreignColumns: [leads.id, leads.organizationId],
      name: 'meetings_lead_org_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.sourceAttemptId, table.organizationId],
      foreignColumns: [callAttempts.id, callAttempts.organizationId],
      name: 'meetings_attempt_org_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.slotOfferId, table.organizationId],
      foreignColumns: [meetingSlotOffers.id, meetingSlotOffers.organizationId],
      name: 'meetings_slot_offer_org_fk',
    }).onDelete('no action'),
    index('meetings_org_calendar_starts_idx').on(
      table.organizationId,
      table.calendarId,
      table.startsAt,
    ),
    ...meetingChecks(table),
  ],
);

type MeetingCheckColumns = Record<
  | 'startsAt'
  | 'endsAt'
  | 'version'
  | 'idempotencyKey'
  | 'requestFingerprint'
  | 'status'
  | 'canceledAt'
  | 'canceledByType'
  | 'canceledById'
  | 'cancelReason',
  AnyPgColumn
>;

/** Invariantes de valor da reunião (intervalo, versão, chave e cancelamento). */
function meetingChecks(table: MeetingCheckColumns) {
  return [
    check('meetings_interval_chk', sql`${table.endsAt} > ${table.startsAt}`),
    check('meetings_version_chk', sql`${table.version} > 0`),
    check(
      'meetings_idempotency_key_chk',
      sql`char_length(${table.idempotencyKey}) BETWEEN 8 AND 128`,
    ),
    check('meetings_fingerprint_chk', sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
    check(
      'meetings_cancellation_chk',
      sql`(${table.status} = 'SCHEDULED' AND ${table.canceledAt} IS NULL)
        OR (${table.status} = 'CANCELED' AND ${table.canceledAt} IS NOT NULL
          AND ${table.canceledByType} IS NOT NULL AND ${table.canceledById} IS NOT NULL)`,
    ),
    check(
      'meetings_cancel_reason_chk',
      sql`${table.cancelReason} IS NULL OR char_length(${table.cancelReason}) BETWEEN 1 AND 500`,
    ),
  ];
}

export type MeetingEntity = InferSelectModel<typeof meetings>;
