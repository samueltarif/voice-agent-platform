import { and, eq } from 'drizzle-orm';
import { listAvailableSlots, type TimeInterval } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { leads } from '../schema/leads.js';
import { meetingSlotOffers, type MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import type { DatabaseExecutor } from './database-executor.js';
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
  | { readonly kind: 'CALENDAR_NOT_FOUND' | 'LEAD_NOT_FOUND' | 'LEAD_NOT_BOOKABLE' };

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

  offerSlots(
    command: SlotSearchCommand & {
      readonly leadId: string;
      readonly sourceAttemptId?: string | undefined;
      readonly ttlMinutes?: number | undefined;
    },
  ): Promise<OfferSlotsOutcome> {
    return this.db.transaction(async (tx) => {
      const [lead] = await tx
        .select({ status: leads.status })
        .from(leads)
        .where(and(eq(leads.id, command.leadId), eq(leads.organizationId, command.organizationId)));
      if (!lead) return { kind: 'LEAD_NOT_FOUND' as const };
      if (lead.status === 'DO_NOT_CALL' || lead.status === 'MEETING_SCHEDULED') {
        return { kind: 'LEAD_NOT_BOOKABLE' as const };
      }
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
