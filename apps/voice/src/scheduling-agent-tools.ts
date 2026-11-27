import {
  createZodToolValidator,
  findSlotsArgumentsSchema,
  requestBookingArgumentsSchema,
  SCHEDULING_FIND_SLOTS_TOOL,
  SCHEDULING_REQUEST_BOOKING_TOOL,
  type FindSlotsArguments,
  type FindSlotsResult,
  type RequestBookingArguments,
  type RequestBookingResult,
  type SchedulingAgentPort,
  type SchedulingAgentScope,
  type ToolDefinition,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import { isIssuedPublishedToolGrant, type PublishedToolGrant } from './published-tool-grant.js';
import { SCHEDULING_GRANT_REQUIRED_MESSAGE } from './scheduling-session-authority.js';

/**
 * E2 (DEC-075; simplificada pela DEC-077) — ferramentas canônicas de
 * agendamento, LIGADAS a uma concessão emitida pelo `CallLifecycleGateway`.
 * O escopo (tenant, sessão, agente, versão e agenda da versão) vem só da
 * concessão; o contexto de execução precisa coincidir com ela (o motor
 * também confere, via `createPublishedVersionToolAuthorizer`). O modelo não
 * passa ids de tenant, lead ou oferta. `request_booking` só registra a
 * intenção: a reunião depende da reconciliação pós-chamada.
 *
 * Nada aqui é registrado na composição de produção (offline).
 */

export const SCHEDULING_CONTEXT_MISMATCH_MESSAGE =
  'Scheduling tool context does not match the trusted grant.';

/** Escopo a partir de uma concessão LEGÍTIMA (cópia, JSON ou objeto igual lançam erro). */
export function schedulingScopeForGrant(grant: unknown): SchedulingAgentScope {
  if (!isIssuedPublishedToolGrant(grant)) throw new Error(SCHEDULING_GRANT_REQUIRED_MESSAGE);
  return Object.freeze({
    organizationId: grant.organizationId,
    sessionId: grant.callId,
    agentId: grant.agentId,
    agentVersionId: grant.agentVersionId,
    grantCalendarId: grant.schedulingCalendarId,
  });
}

/** O contexto de execução tem de ser exatamente o da concessão (inclusive o mesmo snapshot). */
export function assertGrantContext(grant: PublishedToolGrant, context: ToolExecutionContext): void {
  const same =
    context.organizationId === grant.organizationId &&
    context.agentVersionId === grant.agentVersionId &&
    context.callId === grant.callId &&
    context.snapshot === grant.snapshot;
  if (!same) throw new Error(SCHEDULING_CONTEXT_MISMATCH_MESSAGE);
}

export function createSchedulingToolDefinitions(
  grant: PublishedToolGrant,
  port: SchedulingAgentPort,
): readonly [
  ToolDefinition<FindSlotsArguments, FindSlotsResult>,
  ToolDefinition<RequestBookingArguments, RequestBookingResult>,
] {
  const scope = schedulingScopeForGrant(grant);
  return [
    {
      name: SCHEDULING_FIND_SLOTS_TOOL,
      description:
        'Consulta a agenda e devolve até 3 horários (listRevision e opções numeradas, cada uma com a confirmationQuestion canônica). Ofereça só esses horários; para confirmar a escolha, leia a confirmationQuestion da opção sem alterar nenhuma palavra; não invente horários.',
      validateInput: createZodToolValidator(findSlotsArgumentsSchema),
      execute: async (input, context) => {
        assertGrantContext(grant, context);
        return port.findSlots(scope, input);
      },
    },
    {
      name: SCHEDULING_REQUEST_BOOKING_TOOL,
      description:
        'Use SOMENTE depois de ler, palavra por palavra, a confirmationQuestion da opção escolhida (devolvida por scheduling.find_slots) como sua última frase e o interlocutor dizer claramente que aceita. Informe listRevision, a opção e a frase exata de aceite. NÃO marca a reunião: diga apenas que o pedido foi anotado e que a confirmação vem depois da ligação.',
      validateInput: createZodToolValidator(requestBookingArgumentsSchema),
      execute: async (input, context) => {
        assertGrantContext(grant, context);
        return port.requestBooking(scope, input);
      },
    },
  ];
}
