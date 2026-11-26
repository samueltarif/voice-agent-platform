import type { AgentConfigurationSnapshotV1 } from '../agents/agent-configuration-v1.js';
import { SCHEDULING_TOOL_NAMES } from './scheduling-agent-port.js';

/**
 * E2 PR 2 (DEC-075) — compatibilidade entre toolset e agendamento na
 * PUBLICAÇÃO (regra pura; a existência da agenda no tenant é conferida no
 * banco pelo serviço de publicação):
 * - as duas ferramentas de agendamento só existem JUNTAS (consultar sem poder
 *   confirmar, ou confirmar sem consultar, não é um fluxo válido);
 * - a agenda configurada na versão é conferida mesmo sem as ferramentas: a
 *   versão publicada não pode apontar para agenda inexistente.
 */
export type SchedulingToolsetRejection = 'SCHEDULING_TOOLS_INCOMPLETE';

export function evaluateSchedulingToolset(
  snapshot: Pick<AgentConfigurationSnapshotV1, 'tools'>,
): SchedulingToolsetRejection | null {
  const tools = snapshot.tools ?? [];
  const present = SCHEDULING_TOOL_NAMES.filter((name) => tools.includes(name)).length;
  return present === 0 || present === SCHEDULING_TOOL_NAMES.length
    ? null
    : 'SCHEDULING_TOOLS_INCOMPLETE';
}

export function schedulingCalendarToVerify(
  snapshot: Pick<AgentConfigurationSnapshotV1, 'scheduling'>,
): string | null {
  return snapshot.scheduling?.calendarId ?? null;
}
