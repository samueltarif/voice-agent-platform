import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { callAttempts } from './call-attempts.js';
import { callSessions } from './call-sessions.js';
import { leads } from './leads.js';
import { meetingSlotOffers } from './meeting-slot-offers.js';
import { meetings } from './meetings.js';
import { organizations } from './organizations.js';

/**
 * E2 simplificada (DEC-077) — INTENÇÃO de agendamento registrada pela
 * ferramenta `scheduling.request_booking` durante a chamada. Não reserva
 * nada: a reunião só é criada pela reconciliação pós-chamada, com aceite
 * comprovado no histórico e pela reserva transacional da E1 (mesma oferta).
 *
 * - `lead_confirmation`: frase passada pelo MODELO — registro para revisão,
 *   nunca prova de aceite.
 * - uma intenção `PENDING_EVIDENCE` por sessão; um novo pedido substitui a
 *   anterior (`SUPERSEDED`).
 * - `BOOKED` ⇔ `meeting_id` preenchido.
 */
export const BOOKING_INTENT_STATUSES = [
  'PENDING_EVIDENCE',
  'SUPERSEDED',
  'BOOKED',
  'REJECTED',
  'NEEDS_REVIEW',
  'CANCELED',
] as const;
export type BookingIntentStatus = (typeof BOOKING_INTENT_STATUSES)[number];

export const bookingIntents = pgTable(
  'booking_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    listRevision: integer('list_revision').notNull(),
    option: integer('option').notNull(),
    leadConfirmation: text('lead_confirmation').notNull(),
    status: text('status').$type<BookingIntentStatus>().notNull().default('PENDING_EVIDENCE'),
    decisionReason: text('decision_reason'),
    meetingId: uuid('meeting_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.organizationId],
      foreignColumns: [callSessions.id, callSessions.organizationId],
      name: 'booking_intents_session_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.attemptId, table.organizationId],
      foreignColumns: [callAttempts.id, callAttempts.organizationId],
      name: 'booking_intents_attempt_org_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.leadId, table.organizationId],
      foreignColumns: [leads.id, leads.organizationId],
      name: 'booking_intents_lead_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.offerId, table.organizationId],
      foreignColumns: [meetingSlotOffers.id, meetingSlotOffers.organizationId],
      name: 'booking_intents_offer_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetings.id, meetings.organizationId],
      name: 'booking_intents_meeting_org_fk',
    }).onDelete('no action'),
    uniqueIndex('booking_intents_one_pending_per_session_uidx')
      .on(table.organizationId, table.sessionId)
      .where(sql`${table.status} = 'PENDING_EVIDENCE'`),
    index('booking_intents_org_lead_idx').on(table.organizationId, table.leadId),
    check(
      'booking_intents_status_chk',
      sql`${table.status} IN ('PENDING_EVIDENCE', 'SUPERSEDED', 'BOOKED', 'REJECTED', 'NEEDS_REVIEW', 'CANCELED')`,
    ),
    check(
      'booking_intents_meeting_chk',
      sql`(${table.status} = 'BOOKED') = (${table.meetingId} IS NOT NULL)`,
    ),
    check('booking_intents_option_chk', sql`${table.option} BETWEEN 1 AND 3`),
    check(
      'booking_intents_revision_chk',
      sql`${table.listRevision} >= 1 AND ${table.version} >= 1`,
    ),
    check(
      'booking_intents_phrase_chk',
      sql`char_length(${table.leadConfirmation}) BETWEEN 1 AND 300`,
    ),
  ],
);

export type BookingIntentEntity = InferSelectModel<typeof bookingIntents>;
