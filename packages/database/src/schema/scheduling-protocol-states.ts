import { sql, type InferSelectModel } from 'drizzle-orm';
import {
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
 * E2 (DEC-075; simplificada pela DEC-077) — estado PERSISTIDO das listas de
 * oferta de uma sessão: uma linha por (tenant, sessão). `state` é escrito SÓ
 * pelo redutor puro (`advanceBookingProtocol`), sob a trava S (linha da
 * sessão `FOR SHARE` + esta linha `FOR UPDATE`). Na conexão direta só os
 * eventos de lista, consulta vazia e encerramento chegam aqui; as fases de
 * fala da PR 1 ficam inertes (não há eventos de fala na plataforma).
 *
 * - `seq`: último número de sequência atribuído PELO SERVIDOR nesta sessão.
 * - `optOutRecordedAt`/`optOutSource` (0017): supressão canônica registrada
 *   nesta sessão — pela ferramenta (`TOOL`, preventiva) ou pela
 *   reconciliação pós-chamada (`POST_CALL`). Bloqueia oferta e pedido.
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
    // `IN` sobre NULL não pode deixar uma combinação passar (auditoria consolidada).
    check(
      'scheduling_protocol_states_opt_out_source_chk',
      sql`(${table.optOutRecordedAt} IS NULL AND ${table.optOutSource} IS NULL)
        OR (${table.optOutRecordedAt} IS NOT NULL AND ${table.optOutSource} IS NOT NULL
          AND ${table.optOutSource} IN ('TOOL', 'POST_CALL'))`,
    ),
    check('scheduling_protocol_states_seq_chk', sql`${table.seq} >= 0 AND ${table.version} >= 1`),
  ],
);

export type SchedulingProtocolStateEntity = InferSelectModel<typeof schedulingProtocolStates>;
