import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { callAttempts } from './call-attempts.js';
import { callSessions } from './call-sessions.js';
import { organizations } from './organizations.js';

/**
 * E2 simplificada (DEC-077) — RECONCILIAÇÃO pós-chamada de uma sessão.
 *
 * Enquanto `status` não for `RECONCILED`, nenhuma nova tentativa para o
 * mesmo telefone é liberada (barreira no claim de envio): relatório pendente,
 * atrasado, ausente, duplicado com conteúdo diferente ou evidência ambígua
 * deixam a sessão em `AWAITING_REPORT`/`NEEDS_REVIEW` até decisão humana.
 *
 * - `proposed_outcome`: resultado PROPOSTO pela ferramenta; aplicado só com
 *   interlocução comprovada no histórico (`outcome_applied`).
 * - `opt_out_tool_at`/`opt_out_tool_phrase`: supressão preventiva pela
 *   ferramenta (a frase é do modelo — só registro).
 * - `report_digest`: SHA-256 do relatório normalizado (idempotência);
 *   o conteúdo do histórico NÃO é armazenado (minimização).
 */
export const POST_CALL_RECONCILIATION_STATUSES = [
  'AWAITING_REPORT',
  'NEEDS_REVIEW',
  'RECONCILED',
] as const;
export type PostCallReconciliationStatus = (typeof POST_CALL_RECONCILIATION_STATUSES)[number];

export const postCallReconciliations = pgTable(
  'post_call_reconciliations',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    leadId: uuid('lead_id'),
    phoneE164: text('phone_e164').notNull(),
    status: text('status')
      .$type<PostCallReconciliationStatus>()
      .notNull()
      .default('AWAITING_REPORT'),
    proposedOutcome: text('proposed_outcome'),
    outcomeApplied: text('outcome_applied'),
    optOutToolAt: timestamp('opt_out_tool_at', { withTimezone: true }),
    optOutToolPhrase: text('opt_out_tool_phrase'),
    reportDigest: text('report_digest'),
    reportReceivedAt: timestamp('report_received_at', { withTimezone: true }),
    reportEndReason: text('report_end_reason'),
    /** M2: digests de relatórios CONFLITANTES já registrados (a reentrega preserva a decisão humana). */
    conflictDigests: text('conflict_digests')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    reviewReasons: text('review_reasons')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    reconciledBy: text('reconciled_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    primaryKey({
      name: 'post_call_reconciliations_pk',
      columns: [table.organizationId, table.sessionId],
    }),
    foreignKey({
      columns: [table.sessionId, table.organizationId],
      foreignColumns: [callSessions.id, callSessions.organizationId],
      name: 'post_call_reconciliations_session_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.attemptId, table.organizationId],
      foreignColumns: [callAttempts.id, callAttempts.organizationId],
      name: 'post_call_reconciliations_attempt_org_fk',
    }).onDelete('no action'),
    index('post_call_reconciliations_open_phone_idx')
      .on(table.organizationId, table.phoneE164)
      .where(sql`${table.status} <> 'RECONCILED'`),
    check(
      'post_call_reconciliations_status_chk',
      sql`${table.status} IN ('AWAITING_REPORT', 'NEEDS_REVIEW', 'RECONCILED')`,
    ),
    check(
      'post_call_reconciliations_outcome_chk',
      sql`(${table.proposedOutcome} IS NULL OR ${table.proposedOutcome} IN ('CONTACTED', 'QUALIFIED', 'NOT_INTERESTED'))
        AND (${table.outcomeApplied} IS NULL OR ${table.outcomeApplied} IN ('CONTACTED', 'QUALIFIED', 'NOT_INTERESTED'))`,
    ),
    check(
      'post_call_reconciliations_reconciled_chk',
      sql`(${table.status} = 'RECONCILED') = (${table.reconciledAt} IS NOT NULL)`,
    ),
    check(
      'post_call_reconciliations_phrase_chk',
      sql`${table.optOutToolPhrase} IS NULL OR char_length(${table.optOutToolPhrase}) <= 300`,
    ),
    check('post_call_reconciliations_version_chk', sql`${table.version} >= 1`),
  ],
);

export type PostCallReconciliationEntity = InferSelectModel<typeof postCallReconciliations>;
