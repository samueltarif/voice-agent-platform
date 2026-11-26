import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BookingProtocolState } from '@voice-agent/contracts';
import { callSessions } from './call-sessions.js';
import { organizations } from './organizations.js';

/**
 * E2 PR 2 (DEC-075, desenho §6) — estado PERSISTIDO do protocolo de
 * agendamento: uma linha por (tenant, sessão). `state` é escrito SÓ pelo
 * redutor puro (`advanceBookingProtocol`), sob a trava S (linha da sessão
 * `FOR SHARE` + esta linha `FOR UPDATE`).
 *
 * - `seq`: último número de sequência atribuído PELO SERVIDOR nesta sessão
 *   (eventos do protocolo e marcas de início de fala do interlocutor).
 * - `leadSpeechStartedSeq`: início da fala ainda sem fala final (associação
 *   temporal `deliveredSeq < startedSeq ≤ seq`).
 * - `optOutPending`: possível opt-out em esclarecimento — bloqueia oferta e
 *   reserva até a resolução (PR 3).
 * - `version`: contador de escritas (diagnóstico; a exclusão é a trava).
 */
export const schedulingProtocolStates = pgTable(
  'scheduling_protocol_states',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    state: jsonb('state').$type<BookingProtocolState>().notNull(),
    seq: integer('seq').notNull().default(0),
    leadSpeechStartedSeq: integer('lead_speech_started_seq'),
    optOutPending: boolean('opt_out_pending').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'scheduling_protocol_states_pk',
      columns: [table.organizationId, table.sessionId],
    }),
    foreignKey({
      columns: [table.sessionId, table.organizationId],
      foreignColumns: [callSessions.id, callSessions.organizationId],
      name: 'scheduling_protocol_states_session_org_fk',
    }).onDelete('cascade'),
    check('scheduling_protocol_states_seq_chk', sql`${table.seq} >= 0 AND ${table.version} >= 1`),
    check(
      'scheduling_protocol_states_speech_start_chk',
      sql`${table.leadSpeechStartedSeq} IS NULL
        OR (${table.leadSpeechStartedSeq} > 0 AND ${table.leadSpeechStartedSeq} <= ${table.seq})`,
    ),
  ],
);

export type SchedulingProtocolStateEntity = InferSelectModel<typeof schedulingProtocolStates>;
