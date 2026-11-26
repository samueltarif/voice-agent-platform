import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { SCHEDULING_CALENDAR_SOURCES } from '@voice-agent/contracts';
import { callSessions } from './call-sessions.js';
import { organizations } from './organizations.js';

export const schedulingCalendarSourceEnum = pgEnum(
  'scheduling_calendar_source',
  SCHEDULING_CALENDAR_SOURCES,
);

/**
 * E2 PR 1 (DEC-075, D1/M1) — resolução de agenda FIXADA na sessão na primeira
 * consulta: agenda, origem e versão publicada não mudam durante a chamada,
 * mesmo que campanha, agente ou padrão da empresa mudem. Uma linha por
 * (tenant, sessão); escrita só por INSERT ... ON CONFLICT DO NOTHING.
 * Sem FK para a agenda de propósito: agenda removida depois é detectada na
 * revalidação e BLOQUEIA (não cai silenciosamente para outra).
 */
export const schedulingSessionContexts = pgTable(
  'scheduling_session_contexts',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    agentVersionId: uuid('agent_version_id').notNull(),
    resolution: text('resolution').notNull(),
    calendarId: uuid('calendar_id'),
    calendarSource: schedulingCalendarSourceEnum('calendar_source'),
    blockedReason: text('blocked_reason'),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'scheduling_session_contexts_pk',
      columns: [table.organizationId, table.sessionId],
    }),
    foreignKey({
      columns: [table.sessionId, table.organizationId],
      foreignColumns: [callSessions.id, callSessions.organizationId],
      name: 'scheduling_session_contexts_session_org_fk',
    }).onDelete('cascade'),
    check(
      'scheduling_session_contexts_resolution_chk',
      sql`(${table.resolution} = 'RESOLVED' AND ${table.calendarId} IS NOT NULL
          AND ${table.calendarSource} IS NOT NULL AND ${table.blockedReason} IS NULL)
        OR (${table.resolution} = 'ABSENT' AND ${table.calendarId} IS NULL
          AND ${table.calendarSource} IS NULL AND ${table.blockedReason} IS NULL)
        OR (${table.resolution} = 'BLOCKED' AND ${table.calendarSource} IS NOT NULL
          AND ${table.blockedReason} IN ('CALENDAR_NOT_FOUND', 'AGENT_CONFIGURATION_INVALID'))`,
    ),
  ],
);

export type SchedulingSessionContextEntity = InferSelectModel<typeof schedulingSessionContexts>;
