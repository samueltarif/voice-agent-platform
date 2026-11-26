import type { BookingAuthorization, SchedulingRefusal } from '@voice-agent/contracts';
import type { DatabaseExecutor } from './database-executor.js';
import type { BookMeetingOutcome } from './meeting-booking-steps.js';
import type { OfferedBookingHooks } from './meeting-booking-validation.js';
import { commercialBlock } from './scheduling-agent-scope.js';
import {
  applyProtocolEvent,
  lockProtocol,
  type LockedProtocol,
  type SchedulingBinding,
} from './scheduling-protocol-store.js';

/**
 * E2 PR 2 (DEC-075, A4) — consumo da autorização e registro do resultado na
 * MESMA transação da reserva da E1 (sem commit independente):
 * - `afterAttemptLock` (entre A e P): trava S, revalida sessão ativa, vínculo
 *   e autorização vigente (uso único, não vencida, sem opt-out pendente) e
 *   grava `AUTHORIZED → BOOKING`;
 * - `beforeCommit` (todo resultado): grava `BOOKING_RESULT` — `BOOKED` só com
 *   reunião da MESMA oferta e tentativa; repetição concorrente da mesma
 *   autorização vira recuperação, nunca reserva nova.
 * Qualquer recusa aqui lança `ProtocolAbort`: a transação inteira (reunião,
 * oferta, lead, histórico, auditoria e estado) é desfeita.
 */

export class ProtocolAbort extends Error {
  constructor(readonly refusal: SchedulingRefusal) {
    super(`Scheduling protocol refused the booking: ${refusal}`);
    this.name = 'ProtocolAbort';
  }
}

export interface BookingTrack {
  locked: LockedProtocol | null;
  consumed: boolean;
  /** `beforeCommit` terminou: um erro depois disso só pode vir do COMMIT (resultado desconhecido). */
  finished: boolean;
}

export interface BookingHookInput {
  readonly binding: SchedulingBinding;
  readonly authorization: BookingAuthorization;
  readonly clock: () => Date;
  readonly track: BookingTrack;
  /** Ponto observável para testes determinísticos de concorrência. */
  readonly beforeSessionLock?: (() => Promise<void>) | undefined;
}

async function ensureLocked(tx: DatabaseExecutor, input: BookingHookInput) {
  if (input.track.locked) return input.track.locked;
  await input.beforeSessionLock?.();
  const locked = await lockProtocol(tx, input.binding);
  if (!locked) throw new ProtocolAbort('CONTEXT_REFUSED');
  input.track.locked = locked;
  return locked;
}

/** A autorização persistida tem de ser EXATAMENTE a que iniciou esta reserva. */
function authorizationRefusal(
  locked: LockedProtocol,
  input: BookingHookInput,
): SchedulingRefusal | null {
  const block = commercialBlock(locked);
  if (block) return block;
  const current = locked.row.state.authorization;
  const same =
    locked.row.state.phase === 'AUTHORIZED' &&
    current?.authorizationId === input.authorization.authorizationId &&
    current.offerId === input.authorization.offerId &&
    !current.consumed;
  return same ? null : 'NOT_AUTHORIZED';
}

async function consume(tx: DatabaseExecutor, input: BookingHookInput): Promise<boolean> {
  const locked = await ensureLocked(tx, input);
  const refusal = authorizationRefusal(locked, input);
  if (refusal) throw new ProtocolAbort(refusal);
  const applied = await applyProtocolEvent(tx, locked, {
    body: { type: 'AUTHORIZATION_CONSUMED', authorizationId: input.authorization.authorizationId },
    now: input.clock(),
  });
  input.track.locked = applied.locked;
  input.track.consumed = applied.step.state.phase === 'BOOKING';
  return input.track.consumed;
}

function verifiedMeeting(outcome: BookMeetingOutcome, input: BookingHookInput) {
  if (outcome.kind !== 'BOOKED' && outcome.kind !== 'REPLAYED') return null;
  const meeting = outcome.meeting;
  const same =
    meeting.slotOfferId === input.authorization.offerId &&
    meeting.sourceAttemptId === input.binding.attemptId &&
    meeting.organizationId === input.binding.organizationId &&
    meeting.status === 'SCHEDULED';
  return same ? { meetingId: meeting.id, offerId: input.authorization.offerId } : null;
}

/** Repetição concorrente da MESMA autorização já reservada: só recuperação, sem escrita. */
function isRecovery(locked: LockedProtocol, outcome: BookMeetingOutcome): boolean {
  const state = locked.row.state;
  return (
    state.phase === 'BOOKED' &&
    (outcome.kind === 'REPLAYED' || outcome.kind === 'BOOKED') &&
    outcome.meeting.id === state.meetingId
  );
}

async function recordResult(
  tx: DatabaseExecutor,
  input: BookingHookInput,
  outcome: BookMeetingOutcome,
) {
  const locked = await ensureLocked(tx, input);
  if (isRecovery(locked, outcome)) return;
  // Caminhos em que a E1 decidiu antes da tentativa (ex.: oferta já usada):
  // a autorização é consumida aqui, na mesma transação, e o resultado gravado.
  if (!input.track.consumed && !(await consume(tx, input))) return;
  const applied = await applyProtocolEvent(tx, input.track.locked!, {
    body: {
      type: 'BOOKING_RESULT',
      authorizationId: input.authorization.authorizationId,
      outcome: outcome.kind,
      verifiedMeeting: verifiedMeeting(outcome, input),
    },
    now: input.clock(),
  });
  input.track.locked = applied.locked;
}

export function protocolBookingHooks(input: BookingHookInput): OfferedBookingHooks {
  return {
    afterAttemptLock: async (tx) => {
      // Vencida no consumo: aborta sem reservar; o estado é reajustado depois (CLOCK).
      if (!(await consume(tx, input))) throw new ProtocolAbort('NOT_AUTHORIZED');
    },
    beforeCommit: async (tx, outcome) => {
      await recordResult(tx, input, outcome);
      input.track.finished = true;
    },
  };
}
