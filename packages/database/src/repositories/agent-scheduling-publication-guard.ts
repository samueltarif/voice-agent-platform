import { and, eq } from 'drizzle-orm';
import {
  evaluateSchedulingToolset,
  schedulingCalendarToVerify,
  type AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { AppError } from '@voice-agent/errors';
import { schedulingCalendars } from '../schema/scheduling-calendars.js';
import type { DatabaseExecutor } from './database-executor.js';

export const SCHEDULING_PUBLICATION_ERROR_CODES = {
  TOOLS_INCOMPLETE: 'SCHEDULING_TOOLS_INCOMPLETE',
  CALENDAR_NOT_FOUND: 'SCHEDULING_CALENDAR_NOT_FOUND',
} as const;

/**
 * E2 PR 2 (DEC-075; desenho §7/§8) — compatibilidade entre publicação,
 * toolset e agenda, conferida NA TRANSAÇÃO da publicação:
 * - as ferramentas de agendamento só podem ser publicadas juntas;
 * - a agenda configurada na versão precisa existir no MESMO tenant
 *   (`FOR KEY SHARE`: não pode ser removida enquanto a publicação decide).
 * Agenda removida depois continua bloqueando na resolução da sessão (PR 1).
 */
export async function assertSchedulingPublication(
  tx: DatabaseExecutor,
  input: { readonly organizationId: string; readonly snapshot: AgentConfigurationSnapshotV1 },
): Promise<void> {
  if (evaluateSchedulingToolset(input.snapshot)) {
    throw new AppError(
      'Scheduling tools must be published together',
      422,
      SCHEDULING_PUBLICATION_ERROR_CODES.TOOLS_INCOMPLETE,
    );
  }
  const calendarId = schedulingCalendarToVerify(input.snapshot);
  if (!calendarId) return;
  const [calendar] = await tx
    .select({ id: schedulingCalendars.id })
    .from(schedulingCalendars)
    .where(
      and(
        eq(schedulingCalendars.id, calendarId),
        eq(schedulingCalendars.organizationId, input.organizationId),
      ),
    )
    .for('key share');
  if (!calendar) {
    throw new AppError(
      'Scheduling calendar not found for this organization',
      422,
      SCHEDULING_PUBLICATION_ERROR_CODES.CALENDAR_NOT_FOUND,
    );
  }
}
