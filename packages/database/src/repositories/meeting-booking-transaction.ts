import { meetings } from '../schema/meetings.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockLead } from './lead-status-writer.js';
import {
  BookingDecisionExpired,
  temporalRefusal,
  type TemporalConditions,
} from './meeting-booking-guards.js';
import { recordBooking } from './meeting-booking-record.js';
import {
  findMeetingByKey,
  lockIdempotencyKey,
  replayOutcome,
  type BookMeetingOutcome,
  type MeetingBookingRequest,
} from './meeting-booking-steps.js';
import { resolveBookingTargets, type OfferedBookingHooks } from './meeting-booking-validation.js';

/** E1 (DEC-074) — corpo da transação de reserva; E2 PR 2 acrescenta os ganchos opcionais. */

export interface TransactionInput {
  readonly request: MeetingBookingRequest;
  readonly fingerprint: string;
  readonly clock: () => Date;
  readonly hooks?: OfferedBookingHooks | undefined;
}

type Decision = { readonly outcome: BookMeetingOutcome; readonly temporal?: TemporalConditions };

/**
 * Executor transacional canônico: decide e escreve (`decideInTransaction`),
 * chama `beforeCommit` (E2) para TODO resultado e, por último, a guarda
 * temporal final (A2) — que desfaz tudo, inclusive o que o gancho escreveu.
 */
export async function bookInTransaction(
  tx: DatabaseExecutor,
  input: TransactionInput,
): Promise<BookMeetingOutcome> {
  const decision = await decideInTransaction(tx, input);
  await input.hooks?.beforeCommit(tx, decision.outcome);
  // Guarda final (A2): o tempo pode ter passado em esperas DEPOIS da decisão
  // (escritas, FKs, gatilhos). Reavaliado após a última escrita; se venceu,
  // a exceção desfaz a transação inteira.
  const refused = decision.temporal && temporalRefusal(decision.temporal, input.clock());
  if (refused) throw new BookingDecisionExpired(refused);
  return decision.outcome;
}

async function decideInTransaction(
  tx: DatabaseExecutor,
  input: TransactionInput,
): Promise<Decision> {
  const { request, fingerprint } = input;
  await lockIdempotencyKey(tx, request.organizationId, request.idempotencyKey);
  const lead = await lockLead(tx, request.organizationId, request.leadId);
  // A chave é lida depois das travas: repetições concorrentes veem a vencedora,
  // e uma reserva válida é repetida mesmo que a oferta já tenha vencido.
  const existing = await findMeetingByKey(tx, request.organizationId, request.idempotencyKey);
  if (existing) return { outcome: replayOutcome(existing, fingerprint) };
  if (!lead) return { outcome: { kind: 'LEAD_NOT_FOUND' } };
  const targets = await resolveBookingTargets(tx, {
    request,
    lead,
    clock: input.clock,
    hooks: input.hooks,
  });
  if (!targets.ok) return { outcome: targets.outcome };
  const [meeting] = await tx
    .insert(meetings)
    .values({
      organizationId: request.organizationId,
      calendarId: targets.calendarId,
      leadId: lead.id,
      startsAt: targets.slot.startsAt,
      endsAt: targets.slot.endsAt,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: fingerprint,
      sourceAttemptId: request.sourceAttemptId ?? null,
      slotOfferId: targets.offer?.id ?? null,
      bookedByType: request.actor.type,
      bookedById: request.actor.id,
    })
    .returning();
  await recordBooking(tx, { request, lead, meeting: meeting!, offer: targets.offer });
  return { outcome: { kind: 'BOOKED', meeting: meeting! }, temporal: targets.temporal };
}
