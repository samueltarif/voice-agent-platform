import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  type PgTableExtraConfigValue,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { CALL_SESSION_STATES } from '@voice-agent/contracts';
import { organizations } from './organizations.js';
import { agentVersions } from './agents.js';
import { callAttempts } from './call-attempts.js';

export const callSessionRuntimeStateEnum = pgEnum(
  'call_session_runtime_state',
  CALL_SESSION_STATES,
);

/**
 * Sessão de chamada (identidade e estado runtime). Distinta da tentativa:
 * ACTIVE = chamada conectada; aceite de originação não implica ACTIVE.
 * `provider_call_reference` é opaca e não confiável até homologação.
 */
export const callSessions = pgTable(
  'call_sessions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull(),
    agentVersionId: uuid('agent_version_id').notNull(),
    currentAttemptId: uuid('current_attempt_id'),
    runtimeState: callSessionRuntimeStateEnum('runtime_state').notNull().default('CREATED'),
    stateVersion: integer('state_version').notNull().default(1),
    providerCallReference: text('provider_call_reference'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.currentAttemptId, table.organizationId],
      foreignColumns: [callAttempts.id, callAttempts.organizationId],
      name: 'call_sessions_attempt_org_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.agentVersionId, table.agentId, table.organizationId],
      foreignColumns: [agentVersions.id, agentVersions.agentId, agentVersions.organizationId],
      name: 'call_sessions_agent_version_org_fk',
    }).onDelete('no action'),
    unique('call_sessions_id_org_unique').on(table.id, table.organizationId),
    /** Uma tentativa pertence a no máximo uma sessão. */
    uniqueIndex('call_sessions_attempt_uidx')
      .on(table.organizationId, table.currentAttemptId)
      .where(sql`${table.currentAttemptId} IS NOT NULL`),
    check('call_sessions_state_version_chk', sql`${table.stateVersion} > 0`),
    check(
      'call_sessions_ended_chk',
      sql`(${table.runtimeState} IN ('ENDED', 'FAILED')) = (${table.endedAt} IS NOT NULL)`,
    ),
    check(
      'call_sessions_failure_reason_chk',
      sql`${table.failureReason} IS NULL OR char_length(${table.failureReason}) <= 200`,
    ),
  ],
);

export type CallSessionEntity = InferSelectModel<typeof callSessions>;
