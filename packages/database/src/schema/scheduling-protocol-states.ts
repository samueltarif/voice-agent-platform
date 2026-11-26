import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  text,
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
    /** Auditoria consolidada (A1): turno do TRANSPORTE dono do início pendente e o último final processado. */
    leadTurnId: text('lead_turn_id'),
    lastFinalTurnId: text('last_final_turn_id'),
    /** A7: falas finais processadas nesta sessão (evidência de interlocução). */
    leadFinalUtterances: integer('lead_final_utterances').notNull().default(0),
    optOutPending: boolean('opt_out_pending').notNull().default(false),
    /** E2 PR 3: pergunta de esclarecimento em fala (geração) e `seq` da entrega completa. */
    optOutQuestionGeneration: text('opt_out_question_generation'),
    optOutQuestionDeliveredSeq: integer('opt_out_question_delivered_seq'),
    /** E2 PR 3: opt-out gravado na supressão canônica nesta sessão (e a origem da evidência). */
    optOutRecordedAt: timestamp('opt_out_recorded_at', { withTimezone: true }),
    optOutSource: text('opt_out_source'),
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
    // Auditoria consolidada: `IN` sobre NULL não pode deixar uma combinação passar.
    check(
      'scheduling_protocol_states_opt_out_source_chk',
      sql`(${table.optOutRecordedAt} IS NULL AND ${table.optOutSource} IS NULL)
        OR (${table.optOutRecordedAt} IS NOT NULL AND ${table.optOutSource} IS NOT NULL
          AND ${table.optOutSource} IN ('LEAD_UTTERANCE', 'CLARIFICATION', 'RECOVERY'))`,
    ),
    check(
      'scheduling_protocol_states_lead_turn_chk',
      sql`(${table.leadSpeechStartedSeq} IS NULL AND ${table.leadTurnId} IS NULL)
        OR (${table.leadSpeechStartedSeq} IS NOT NULL AND ${table.leadTurnId} IS NOT NULL)`,
    ),
    check('scheduling_protocol_states_finals_chk', sql`${table.leadFinalUtterances} >= 0`),
    check('scheduling_protocol_states_seq_chk', sql`${table.seq} >= 0 AND ${table.version} >= 1`),
    check(
      'scheduling_protocol_states_speech_start_chk',
      sql`${table.leadSpeechStartedSeq} IS NULL
        OR (${table.leadSpeechStartedSeq} > 0 AND ${table.leadSpeechStartedSeq} <= ${table.seq})`,
    ),
  ],
);

export type SchedulingProtocolStateEntity = InferSelectModel<typeof schedulingProtocolStates>;
