import { and, asc, eq, gt, lt, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { contacts } from '../schema/contacts.js';
import { leads } from '../schema/leads.js';
import { meetings } from '../schema/meetings.js';

/** Teto de reuniões devolvidas por consulta de período. */
export const MAX_MEETINGS_PER_QUERY = 500;

/**
 * E1 (DEC-074) — leitura de reuniões do tenant por período (sobreposição com
 * [from, to)), com o nome do contato para a futura tela de agenda.
 */
export class DrizzleMeetingQueries {
  constructor(private readonly db: DatabaseInstance) {}

  listMeetings(input: {
    readonly organizationId: string;
    readonly calendarId?: string | undefined;
    readonly from: Date;
    readonly to: Date;
  }) {
    const filters: SQL[] = [
      eq(meetings.organizationId, input.organizationId),
      lt(meetings.startsAt, input.to),
      gt(meetings.endsAt, input.from),
    ];
    if (input.calendarId) filters.push(eq(meetings.calendarId, input.calendarId));
    return this.db
      .select({
        meeting: meetings,
        contactName: contacts.displayName,
        leadStatus: leads.status,
      })
      .from(meetings)
      .innerJoin(
        leads,
        and(eq(leads.id, meetings.leadId), eq(leads.organizationId, meetings.organizationId)),
      )
      .innerJoin(
        contacts,
        and(eq(contacts.id, leads.contactId), eq(contacts.organizationId, leads.organizationId)),
      )
      .where(and(...filters))
      .orderBy(asc(meetings.startsAt), asc(meetings.id))
      .limit(MAX_MEETINGS_PER_QUERY);
  }

  async getMeeting(organizationId: string, meetingId: string) {
    const [row] = await this.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), eq(meetings.organizationId, organizationId)));
    return row ?? null;
  }
}
