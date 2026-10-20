import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { callAttempts } from './call-attempts.js';
import { callSessions } from './call-sessions.js';

export const CALL_EVENT_APPLICATION_RESULTS = ['APPLIED', 'STALE', 'REJECTED'] as const;
export const callEventApplicationResultEnum = pgEnum(
  'call_event_application_result',
  CALL_EVENT_APPLICATION_RESULTS,
);
export const callEventSourceEnum = pgEnum('call_event_source', ['INTERNAL', 'PROVIDER']);

/**
 * Trilha append-only (UPDATE bloqueado por trigger). Identidade de negócio =
 * `event_id`; `fingerprint` detecta replay com conteúdo divergente;
 * `payload_hash` é evidência auxiliar opcional, nunca identidade. `sequence`
 * dá a ordem efetiva de persistência; `occurred_at` é o horário declarado.
 * Não armazena payloads, transcrições, áudio ou credenciais.
 */
export const callEvents = pgTable(
  'call_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
    eventId: uuid('event_id').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    attemptId: uuid('attempt_id'),
    callSessionId: uuid('call_session_id'),
    source: callEventSourceEnum('source').notNull().default('INTERNAL'),
    provider: text('provider'),
    providerCallId: text('provider_call_id'),
    providerEventId: text('provider_event_id'),
    eventType: text('event_type').notNull(),
    /** Apenas atributos operacionais whitelisted (autoridade, motivo, referência opaca). */
    attributes: jsonb('attributes').$type<Record<string, string>>().notNull().default({}),
    fingerprint: text('fingerprint').notNull(),
    payloadHash: text('payload_hash'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    applicationResult: callEventApplicationResultEnum('application_result').notNull(),
    rejectionReason: text('rejection_reason'),
  },
  (table) => [
    foreignKey({
      columns: [table.attemptId, table.organizationId],
      foreignColumns: [callAttempts.id, callAttempts.organizationId],
      name: 'call_events_attempt_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.callSessionId, table.organizationId],
      foreignColumns: [callSessions.id, callSessions.organizationId],
      name: 'call_events_session_org_fk',
    }).onDelete('cascade'),
    uniqueIndex('call_events_event_id_uidx').on(table.eventId),
    uniqueIndex('call_events_sequence_uidx').on(table.sequence),
    index('call_events_org_attempt_seq_idx').on(
      table.organizationId,
      table.attemptId,
      table.sequence,
    ),
    index('call_events_org_session_seq_idx').on(
      table.organizationId,
      table.callSessionId,
      table.sequence,
    ),
    check(
      'call_events_correlation_chk',
      sql`${table.attemptId} IS NOT NULL OR ${table.callSessionId} IS NOT NULL`,
    ),
    check('call_events_attributes_chk', sql`jsonb_typeof(${table.attributes}) = 'object'`),
    check('call_events_type_chk', sql`char_length(${table.eventType}) BETWEEN 1 AND 64`),
    check('call_events_fingerprint_chk', sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check(
      'call_events_payload_hash_chk',
      sql`${table.payloadHash} IS NULL OR ${table.payloadHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'call_events_rejection_chk',
      sql`(${table.applicationResult} = 'REJECTED') = (${table.rejectionReason} IS NOT NULL)`,
    ),
  ],
);

export type CallEventEntity = InferSelectModel<typeof callEvents>;
