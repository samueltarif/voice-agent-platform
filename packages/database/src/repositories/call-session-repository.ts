import { and, eq } from 'drizzle-orm';
import {
  isValidCallSessionStateTransition,
  TERMINAL_CALL_SESSION_STATES,
  type CallSessionState,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { callSessions, type CallSessionEntity } from '../schema/call-sessions.js';
import { lockAttemptRow } from './durable-attempt-event-applier.js';
import {
  classifyPostgresFailure,
  OutboundPersistenceTechnicalError,
} from './outbound-persistence-errors.js';

/** Estados em que uma chamada PODE existir; sessões só nascem a partir deles. */
const SESSION_COMPATIBLE_ATTEMPT_STATES = new Set([
  'ORIGINATION_SENT',
  'ORIGINATION_ACCEPTED',
  'OUTCOME_UNKNOWN',
  'RECONCILIATION_PENDING',
]);

export interface CreateCallSessionInput {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly attemptId: string;
  readonly providerCallReference?: string | undefined;
  readonly now: Date;
}

export type CreateCallSessionResult =
  | { readonly kind: 'CREATED' | 'ALREADY_EXISTS'; readonly session: CallSessionEntity }
  | {
      readonly kind: 'REJECTED';
      readonly reason:
        | 'ATTEMPT_NOT_FOUND'
        | 'ATTEMPT_STATE_INCOMPATIBLE'
        | 'ATTEMPT_ALREADY_BOUND'
        | 'IDENTITY_CONFLICT';
    };

export interface TransitionCallSessionInput {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly expectedStateVersion: number;
  readonly toState: CallSessionState;
  readonly failureReason?: string | undefined;
  readonly now: Date;
}

export type TransitionCallSessionResult =
  | { readonly kind: 'TRANSITIONED'; readonly session: CallSessionEntity }
  | { readonly kind: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'INVALID_TRANSITION' };

type Tx = Parameters<Parameters<DatabaseInstance['transaction']>[0]>[0];

/**
 * Sessões de chamada duráveis. O vínculo sessão→tentativa é imutável e
 * tenant-scoped (FK composta); o vínculo tentativa→sessão só ocorre pela FSM
 * (evento de aceite com `callSessionId`).
 */
export class DrizzleCallSessionRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async create(input: CreateCallSessionInput): Promise<CreateCallSessionResult> {
    try {
      return await this.db.transaction((tx) => this.createInTx(tx, input));
    } catch (error) {
      if (classifyPostgresFailure(error).kind === 'UNIQUE_VIOLATION') {
        return { kind: 'REJECTED', reason: 'IDENTITY_CONFLICT' };
      }
      throw new OutboundPersistenceTechnicalError('createCallSession', { cause: error });
    }
  }

  async getById(scope: { readonly organizationId: string; readonly sessionId: string }) {
    const [row] = await this.db
      .select()
      .from(callSessions)
      .where(
        and(
          eq(callSessions.id, scope.sessionId),
          eq(callSessions.organizationId, scope.organizationId),
        ),
      );
    return row ?? null;
  }

  async transition(input: TransitionCallSessionInput): Promise<TransitionCallSessionResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(callSessions)
        .where(
          and(
            eq(callSessions.id, input.sessionId),
            eq(callSessions.organizationId, input.organizationId),
          ),
        )
        .for('update');
      if (!row) return { kind: 'NOT_FOUND' };
      if (row.stateVersion !== input.expectedStateVersion) return { kind: 'VERSION_CONFLICT' };
      if (!isValidCallSessionStateTransition(row.runtimeState, input.toState)) {
        return { kind: 'INVALID_TRANSITION' };
      }
      return { kind: 'TRANSITIONED', session: await this.persistTransition(tx, { row, input }) };
    });
  }

  private async persistTransition(
    tx: Tx,
    ctx: { readonly row: CallSessionEntity; readonly input: TransitionCallSessionInput },
  ): Promise<CallSessionEntity> {
    const terminal = TERMINAL_CALL_SESSION_STATES.has(ctx.input.toState);
    const [updated] = await tx
      .update(callSessions)
      .set({
        runtimeState: ctx.input.toState,
        stateVersion: ctx.row.stateVersion + 1,
        endedAt: terminal ? ctx.input.now : null,
        failureReason: ctx.input.failureReason ?? ctx.row.failureReason,
        updatedAt: ctx.input.now,
      })
      .where(
        and(eq(callSessions.id, ctx.row.id), eq(callSessions.stateVersion, ctx.row.stateVersion)),
      )
      .returning();
    if (!updated) throw new Error('Session CAS update lost under row lock.');
    return updated;
  }

  private async createInTx(
    tx: Tx,
    input: CreateCallSessionInput,
  ): Promise<CreateCallSessionResult> {
    const attempt = await lockAttemptRow(tx, input);
    if (!attempt) return { kind: 'REJECTED', reason: 'ATTEMPT_NOT_FOUND' };
    const existing = await this.getById(input);
    if (existing && existing.currentAttemptId === input.attemptId) {
      return { kind: 'ALREADY_EXISTS', session: existing };
    }
    if (attempt.callSessionId !== null && attempt.callSessionId !== input.sessionId) {
      return { kind: 'REJECTED', reason: 'ATTEMPT_ALREADY_BOUND' };
    }
    if (!SESSION_COMPATIBLE_ATTEMPT_STATES.has(attempt.state)) {
      return { kind: 'REJECTED', reason: 'ATTEMPT_STATE_INCOMPATIBLE' };
    }
    const [session] = await tx
      .insert(callSessions)
      .values({
        id: input.sessionId,
        organizationId: attempt.organizationId,
        agentId: attempt.agentId,
        agentVersionId: attempt.agentVersionId,
        currentAttemptId: attempt.id,
        providerCallReference: input.providerCallReference ?? null,
        startedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return { kind: 'CREATED', session: session! };
  }
}
