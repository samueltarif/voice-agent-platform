import { and, eq, sql } from 'drizzle-orm';
import {
  advanceBookingProtocol,
  INITIAL_BOOKING_PROTOCOL_STATE,
  type BookingProtocolEvent,
  type BookingProtocolStep,
} from '@voice-agent/contracts';
import { callAttempts } from '../schema/call-attempts.js';
import { callSessions } from '../schema/call-sessions.js';
import {
  schedulingProtocolStates,
  type SchedulingProtocolStateEntity,
} from '../schema/scheduling-protocol-states.js';
import type { DatabaseExecutor } from './database-executor.js';

/**
 * E2 (DEC-075/DEC-077) — trava S e escrita do estado do protocolo.
 *
 * Ordem: tentativa (A, `FOR KEY SHARE`) → sessão (`FOR SHARE`) → linha de
 * estado (`FOR UPDATE`). Compatível com a ordem existente A → S das
 * transições de tentativa (`checkSessionBinding`) e com a transição da sessão
 * (só S). Na reserva, é chamada DEPOIS de K → L → C → O → A e ANTES de P.
 */

export interface SchedulingBinding {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly attemptId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
}

export interface LockedProtocol {
  /** Sessão ACTIVE, ainda da mesma tentativa, agente e versão; tentativa não encerrada. */
  readonly active: boolean;
  readonly row: SchedulingProtocolStateEntity;
}

/** Corpo de evento: `seq` e `at` são sempre atribuídos aqui, pelo servidor. */
export type ProtocolEventBody = BookingProtocolEvent extends infer E
  ? E extends BookingProtocolEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

async function lockAttempt(tx: DatabaseExecutor, binding: SchedulingBinding) {
  const [attempt] = await tx
    .select({ state: callAttempts.state, callSessionId: callAttempts.callSessionId })
    .from(callAttempts)
    .where(
      and(
        eq(callAttempts.id, binding.attemptId),
        eq(callAttempts.organizationId, binding.organizationId),
      ),
    )
    .for('key share');
  return attempt ?? null;
}

async function lockSession(tx: DatabaseExecutor, binding: SchedulingBinding) {
  const [session] = await tx
    .select()
    .from(callSessions)
    .where(
      and(
        eq(callSessions.id, binding.sessionId),
        eq(callSessions.organizationId, binding.organizationId),
      ),
    )
    .for('share');
  return session ?? null;
}

async function lockStateRow(tx: DatabaseExecutor, binding: SchedulingBinding) {
  await tx
    .insert(schedulingProtocolStates)
    .values({
      organizationId: binding.organizationId,
      sessionId: binding.sessionId,
      state: INITIAL_BOOKING_PROTOCOL_STATE,
    })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(schedulingProtocolStates)
    .where(
      and(
        eq(schedulingProtocolStates.organizationId, binding.organizationId),
        eq(schedulingProtocolStates.sessionId, binding.sessionId),
      ),
    )
    .for('update');
  return row!;
}

/** Revalida o vínculo NO MOMENTO do efeito: a concessão sozinha não prova sessão ativa (A3). */
export async function lockProtocol(
  tx: DatabaseExecutor,
  binding: SchedulingBinding,
): Promise<LockedProtocol | null> {
  const attempt = await lockAttempt(tx, binding);
  const session = await lockSession(tx, binding);
  if (!attempt || !session || attempt.callSessionId !== session.id) return null;
  const sameBinding =
    session.currentAttemptId === binding.attemptId &&
    session.agentId === binding.agentId &&
    session.agentVersionId === binding.agentVersionId;
  if (!sameBinding) return null;
  const row = await lockStateRow(tx, binding);
  const active = session.runtimeState === 'ACTIVE' && attempt.state !== 'CLOSED';
  return { active, row };
}

export interface ApplyOptions {
  readonly optOutRecordedAt?: Date | null;
  readonly optOutSource?: 'TOOL' | 'POST_CALL' | null;
}

/** Atribui o próximo `seq`, aplica o redutor puro e grava, sob a trava já obtida. */
export async function applyProtocolEvent(
  tx: DatabaseExecutor,
  locked: LockedProtocol,
  input: { readonly body: ProtocolEventBody; readonly now: Date; readonly options?: ApplyOptions },
): Promise<{ readonly step: BookingProtocolStep; readonly locked: LockedProtocol }> {
  const seq = locked.row.seq + 1;
  const event = { ...input.body, seq, at: input.now.toISOString() } as BookingProtocolEvent;
  const step = advanceBookingProtocol(locked.row.state, event);
  const row = await writeRow(tx, locked.row, {
    state: step.state,
    seq,
    ...input.options,
  });
  return { step, locked: { ...locked, row } };
}

/** Grava marcas da sessão (ex.: opt-out canônico) sem evento do protocolo. */
export async function markSession(
  tx: DatabaseExecutor,
  locked: LockedProtocol,
  options: ApplyOptions,
): Promise<LockedProtocol> {
  const row = await writeRow(tx, locked.row, { seq: locked.row.seq + 1, ...options });
  return { ...locked, row };
}

async function writeRow(
  tx: DatabaseExecutor,
  row: SchedulingProtocolStateEntity,
  changes: ApplyOptions & Partial<Pick<SchedulingProtocolStateEntity, 'state' | 'seq'>>,
): Promise<SchedulingProtocolStateEntity> {
  const [updated] = await tx
    .update(schedulingProtocolStates)
    .set({
      ...changes,
      version: sql`${schedulingProtocolStates.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schedulingProtocolStates.organizationId, row.organizationId),
        eq(schedulingProtocolStates.sessionId, row.sessionId),
      ),
    )
    .returning();
  return updated!;
}
