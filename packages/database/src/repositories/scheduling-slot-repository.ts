import { listAvailableSlots, type TimeInterval } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { meetingSlotOffers, type MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import { isLeadPhoneSuppressed, verifyAttemptDialsLead } from './attempt-lead-association.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockLead } from './lead-status-writer.js';
import {
  findCalendarRow,
  loadBusyIntervals,
  loadCalendarSnapshot,
} from './scheduling-calendar-snapshot.js';

export interface SlotSearchCommand {
  readonly organizationId: string;
  readonly calendarId: string;
  readonly from: Date;
  readonly to: Date;
  readonly limit: number;
  readonly now: Date;
}

/** Validade padrão de uma oferta de horário (minutos). */
export const DEFAULT_SLOT_OFFER_TTL_MINUTES = 15;

export type OfferSlotsOutcome =
  | { readonly kind: 'OFFERED'; readonly offers: MeetingSlotOfferEntity[] }
  | {
      readonly kind:
        | 'CALENDAR_NOT_FOUND'
        | 'LEAD_NOT_FOUND'
        | 'LEAD_NOT_BOOKABLE'
        | 'LEAD_SUPPRESSED'
        | 'ATTEMPT_NOT_FOUND'
        | 'ATTEMPT_LEAD_MISMATCH';
    };

export type OfferSlotsCommand = SlotSearchCommand & {
  readonly leadId: string;
  readonly sourceAttemptId?: string | undefined;
  readonly ttlMinutes?: number | undefined;
};

type OfferRefusal = Exclude<OfferSlotsOutcome, { kind: 'OFFERED' }>;

/**
 * Oferta = prospecção ativa: o lead precisa existir, não estar suprimido nem
 * com reunião ativa, e a tentativa (se houver) precisa ter discado EXATAMENTE
 * o telefone do lead — resolvido no servidor (auditoria A3/A4).
 *
 * Ordem GLOBAL de travas (2ª auditoria; ver o desenho): lead (`FOR UPDATE`) →
 * agenda (`FOR KEY SHARE`) → tentativa (`FOR KEY SHARE`) → telefone (sempre a
 * última). As FKs do INSERT da oferta só pedem travas já obtidas aqui.
 */
async function refuseOffer(
  executor: DatabaseExecutor,
  command: OfferSlotsCommand,
): Promise<OfferRefusal | null> {
  const lead = await lockLead(executor, command.organizationId, command.leadId);
  if (!lead) return { kind: 'LEAD_NOT_FOUND' };
  if (!(await findCalendarRow(executor, { ...command, lock: 'key share' })))
    return { kind: 'CALENDAR_NOT_FOUND' };
  if (command.sourceAttemptId) {
    const association = await verifyAttemptDialsLead(executor, {
      organizationId: command.organizationId,
      attemptId: command.sourceAttemptId,
      leadId: command.leadId,
    });
    if (association !== 'MATCH') return { kind: association };
  }
  if (lead.status === 'DO_NOT_CALL') return { kind: 'LEAD_SUPPRESSED' };
  if (await isLeadPhoneSuppressed(executor, command.organizationId, command.leadId))
    return { kind: 'LEAD_SUPPRESSED' };
  return lead.status === 'MEETING_SCHEDULED' ? { kind: 'LEAD_NOT_BOOKABLE' } : null;
}

async function searchSlots(executor: DatabaseExecutor, command: SlotSearchCommand) {
  const row = await findCalendarRow(executor, command);
  if (!row) return null;
  const calendar = await loadCalendarSnapshot(executor, row);
  const busy = await loadBusyIntervals(executor, { row, from: command.from, to: command.to });
  return listAvailableSlots({ calendar, busy, ...command });
}

/**
 * E1 (DEC-074) — horários livres (somente leitura) e OFERTAS de horário.
 * Uma oferta registra no servidor exatamente o horário apresentado a um lead;
 * a futura confirmação pelo agente reservará pela oferta (`bookOfferedSlot`),
 * nunca por um horário informado pelo modelo.
 */
export class DrizzleSchedulingSlotRepository {
  constructor(private readonly db: DatabaseInstance) {}

  /** `null` = agenda inexistente no tenant. */
  listSlots(command: SlotSearchCommand): Promise<TimeInterval[] | null> {
    return searchSlots(this.db, command);
  }

  offerSlots(command: OfferSlotsCommand): Promise<OfferSlotsOutcome> {
    return this.db.transaction(async (tx) => {
      const refused = await refuseOffer(tx, command);
      if (refused) return refused;
      const slots = await searchSlots(tx, command);
      if (slots === null) return { kind: 'CALENDAR_NOT_FOUND' as const };
      if (slots.length === 0) return { kind: 'OFFERED' as const, offers: [] };
      const ttl = (command.ttlMinutes ?? DEFAULT_SLOT_OFFER_TTL_MINUTES) * 60_000;
      const offers = await tx
        .insert(meetingSlotOffers)
        .values(
          slots.map((slot) => ({
            organizationId: command.organizationId,
            calendarId: command.calendarId,
            leadId: command.leadId,
            sourceAttemptId: command.sourceAttemptId ?? null,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            expiresAt: new Date(command.now.getTime() + ttl),
          })),
        )
        .returning();
      return { kind: 'OFFERED' as const, offers };
    });
  }
}
