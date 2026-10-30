import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
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
import { OUTBOUND_ATTEMPT_STATES } from '@voice-agent/contracts';
import { organizations } from './organizations.js';
import { agentVersions } from './agents.js';
import { outboundCallJobs, outboundCampaigns } from './outbound.js';
import { callSessions } from './call-sessions.js';

/** Mesmos estados da FSM canônica da 008-OF1 (sem simplificação). */
export const callAttemptStateEnum = pgEnum('call_attempt_state', OUTBOUND_ATTEMPT_STATES);

const TERMINAL_STATES_SQL = sql.raw(
  `('ORIGINATION_REJECTED', 'NOT_ORIGINATED', 'CLOSED', 'CANCELED')`,
);

/** 008-OF4: tenant resolvido server-side pela referência do provedor (não única). */
function providerReferenceLookupIndex(column: AnyPgColumn) {
  return index('call_attempts_provider_reference_idx')
    .on(column)
    .where(sql`${column} IS NOT NULL`);
}

/** Varredura de recuperação/reconciliação por estado e lease (008-OF2). */
function stateLeaseIndex(org: AnyPgColumn, state: AnyPgColumn, leaseExpiresAt: AnyPgColumn) {
  return index('call_attempts_org_state_lease_idx').on(org, state, leaseExpiresAt);
}

/** 008-MVP4: relatórios e listagem por campanha (mais recentes primeiro). */
function campaignReportIndex(org: AnyPgColumn, campaign: AnyPgColumn, createdAt: AnyPgColumn) {
  return index('call_attempts_org_campaign_created_idx').on(org, campaign, createdAt);
}

export const callAttempts = pgTable(
  'call_attempts',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    jobId: uuid('job_id').notNull(),
    campaignId: uuid('campaign_id'),
    attemptNumber: integer('attempt_number').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    agentId: uuid('agent_id').notNull(),
    agentVersionId: uuid('agent_version_id').notNull(),
    state: callAttemptStateEnum('state').notNull(),
    /** Versão para CAS: incrementada a cada mutação. */
    stateVersion: integer('state_version').notNull().default(1),
    originationAuthorityId: text('origination_authority_id'),
    providerReference: text('provider_reference'),
    callSessionId: uuid('call_session_id'),
    reconciliationAttempts: integer('reconciliation_attempts').notNull().default(0),
    requiresManualReview: boolean('requires_manual_review').notNull().default(false),
    /** Dono do claim ativo (envio ou reconciliação) e fencing token monotônico. */
    claimOwner: text('claim_owner'),
    fencingToken: integer('fencing_token').notNull().default(0),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    sendStartedAt: timestamp('send_started_at', { withTimezone: true }),
    lastReconciliationAt: timestamp('last_reconciliation_at', { withTimezone: true }),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.jobId, table.organizationId],
      foreignColumns: [outboundCallJobs.id, outboundCallJobs.organizationId],
      name: 'call_attempts_job_org_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.campaignId, table.organizationId],
      foreignColumns: [outboundCampaigns.id, outboundCampaigns.organizationId],
      name: 'call_attempts_campaign_org_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.agentVersionId, table.agentId, table.organizationId],
      foreignColumns: [agentVersions.id, agentVersions.agentId, agentVersions.organizationId],
      name: 'call_attempts_agent_version_org_fk',
    }).onDelete('no action'),
    /**
     * Vínculo bidirecional coerente: a sessão referenciada precisa ser do mesmo
     * tenant E apontar de volta para ESTA tentativa (current_attempt_id = id).
     */
    foreignKey({
      columns: [table.callSessionId, table.organizationId, table.id],
      foreignColumns: [callSessions.id, callSessions.organizationId, callSessions.currentAttemptId],
      name: 'call_attempts_session_binding_fk',
    }).onDelete('no action'),
    unique('call_attempts_id_org_unique').on(table.id, table.organizationId),
    uniqueIndex('call_attempts_job_number_uidx').on(
      table.organizationId,
      table.jobId,
      table.attemptNumber,
    ),
    uniqueIndex('call_attempts_org_idempotency_uidx').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    /** No máximo UMA tentativa não terminal por job: bloqueia sucessoras concorrentes. */
    uniqueIndex('call_attempts_single_open_per_job_uidx')
      .on(table.organizationId, table.jobId)
      .where(sql`${table.state} NOT IN ${TERMINAL_STATES_SQL}`),
    providerReferenceLookupIndex(table.providerReference),
    campaignReportIndex(table.organizationId, table.campaignId, table.createdAt),
    stateLeaseIndex(table.organizationId, table.state, table.leaseExpiresAt),
    check('call_attempts_attempt_number_chk', sql`${table.attemptNumber} > 0`),
    check('call_attempts_state_version_chk', sql`${table.stateVersion} > 0`),
    check('call_attempts_fencing_chk', sql`${table.fencingToken} >= 0`),
    check('call_attempts_reconciliation_chk', sql`${table.reconciliationAttempts} >= 0`),
    check('call_attempts_idempotency_chk', sql`char_length(${table.idempotencyKey}) > 0`),
    check(
      'call_attempts_lease_owner_chk',
      sql`${table.leaseExpiresAt} IS NULL OR ${table.claimOwner} IS NOT NULL`,
    ),
  ],
);

export type CallAttemptEntity = InferSelectModel<typeof callAttempts>;
