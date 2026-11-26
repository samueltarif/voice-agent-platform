import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { AVAILABILITY_EXCEPTION_KINDS } from '@voice-agent/contracts';
import { organizations } from './organizations.js';

/**
 * E1 (DEC-074) — agenda da organização. O fuso IANA é validado na borda
 * (contracts); os limites numéricos repetem a política como defesa no banco.
 * `version` é a concorrência otimista de política e disponibilidade.
 */
export const schedulingCalendars = pgTable(
  'scheduling_calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    timezone: text('timezone').notNull(),
    slotDurationMinutes: integer('slot_duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    minimumNoticeMinutes: integer('minimum_notice_minutes').notNull().default(0),
    bookingHorizonDays: integer('booking_horizon_days').notNull(),
    version: integer('version').notNull().default(1),
    /** E2 PR 1 (D1): agenda padrão EXPLÍCITA da empresa (no máximo uma). */
    isOrganizationDefault: boolean('is_organization_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('scheduling_calendars_org_default_uidx')
      .on(table.organizationId)
      .where(sql`${table.isOrganizationDefault}`),
    unique('scheduling_calendars_org_name_unique').on(table.organizationId, table.name),
    unique('scheduling_calendars_id_org_unique').on(table.id, table.organizationId),
    check('scheduling_calendars_name_chk', sql`char_length(${table.name}) BETWEEN 1 AND 120`),
    check(
      'scheduling_calendars_timezone_chk',
      sql`char_length(${table.timezone}) BETWEEN 1 AND 64`,
    ),
    check(
      'scheduling_calendars_policy_chk',
      sql`${table.slotDurationMinutes} BETWEEN 5 AND 480
        AND ${table.bufferMinutes} BETWEEN 0 AND 240
        AND ${table.minimumNoticeMinutes} BETWEEN 0 AND 43200
        AND ${table.bookingHorizonDays} BETWEEN 1 AND 365`,
    ),
    check('scheduling_calendars_version_chk', sql`${table.version} > 0`),
  ],
);

/** Janelas semanais (dia ISO 1–7, minutos locais); substituídas em bloco. */
export const schedulingAvailabilityRules = pgTable(
  'scheduling_availability_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    calendarId: uuid('calendar_id').notNull(),
    weekday: smallint('weekday').notNull(),
    startMinute: smallint('start_minute').notNull(),
    endMinute: smallint('end_minute').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.calendarId, table.organizationId],
      foreignColumns: [schedulingCalendars.id, schedulingCalendars.organizationId],
      name: 'scheduling_availability_rules_calendar_org_fk',
    }).onDelete('cascade'),
    index('scheduling_availability_rules_calendar_idx').on(table.calendarId, table.weekday),
    check(
      'scheduling_availability_rules_window_chk',
      sql`${table.weekday} BETWEEN 1 AND 7
        AND ${table.startMinute} >= 0 AND ${table.endMinute} <= 1440
        AND ${table.startMinute} < ${table.endMinute}`,
    ),
  ],
);

export const availabilityExceptionKindEnum = pgEnum(
  'availability_exception_kind',
  AVAILABILITY_EXCEPTION_KINDS,
);

/** Exceção de uma data local: bloqueio (com ou sem janela) ou horário extra. */
export const schedulingAvailabilityExceptions = pgTable(
  'scheduling_availability_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    calendarId: uuid('calendar_id').notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    kind: availabilityExceptionKindEnum('kind').notNull(),
    startMinute: smallint('start_minute'),
    endMinute: smallint('end_minute'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.calendarId, table.organizationId],
      foreignColumns: [schedulingCalendars.id, schedulingCalendars.organizationId],
      name: 'scheduling_availability_exceptions_calendar_org_fk',
    }).onDelete('cascade'),
    index('scheduling_availability_exceptions_calendar_date_idx').on(
      table.calendarId,
      table.localDate,
    ),
    check(
      'scheduling_availability_exceptions_window_chk',
      sql`(${table.startMinute} IS NULL AND ${table.endMinute} IS NULL AND ${table.kind} = 'UNAVAILABLE')
        OR (${table.startMinute} IS NOT NULL AND ${table.endMinute} IS NOT NULL
          AND ${table.startMinute} >= 0 AND ${table.endMinute} <= 1440
          AND ${table.startMinute} < ${table.endMinute})`,
    ),
    check(
      'scheduling_availability_exceptions_reason_chk',
      sql`${table.reason} IS NULL OR char_length(${table.reason}) BETWEEN 1 AND 200`,
    ),
  ],
);

export type SchedulingCalendarEntity = InferSelectModel<typeof schedulingCalendars>;
export type SchedulingAvailabilityRuleEntity = InferSelectModel<typeof schedulingAvailabilityRules>;
export type SchedulingAvailabilityExceptionEntity = InferSelectModel<
  typeof schedulingAvailabilityExceptions
>;
