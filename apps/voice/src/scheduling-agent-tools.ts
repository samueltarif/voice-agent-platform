import {
  createBookingClaimFilter,
  confirmOfferArgumentsSchema,
  createZodToolValidator,
  findSlotsArgumentsSchema,
  SCHEDULING_CONFIRM_OFFER_TOOL,
  SCHEDULING_FIND_SLOTS_TOOL,
  type ConfirmOfferArguments,
  type BookingClaimFilter,
  type ConfirmOfferResult,
  type FindSlotsArguments,
  type FindSlotsResult,
  type SchedulingAgentPort,
  type SchedulingAgentScope,
  type ToolDefinition,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import { isIssuedPublishedToolGrant, type PublishedToolGrant } from './published-tool-grant.js';
import { SCHEDULING_GRANT_REQUIRED_MESSAGE } from './scheduling-session-authority.js';

/**
 * E2 PR 2 (DEC-075) — ferramentas canônicas de agendamento, LIGADAS a uma
 * concessão emitida pelo `CallLifecycleGateway`. O escopo (tenant, sessão,
 * agente, versão e agenda da versão) vem só da concessão; o contexto de
 * execução precisa coincidir com ela (o motor também confere, via
 * `createPublishedVersionToolAuthorizer`). O modelo não passa ids,
 * booleanos de consentimento nem ordinais: `find_slots` aceita só um dia
 * preferido; `confirm_offer`, nada.
 *
 * Nada aqui é registrado na composição de produção (offline, PR 2).
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

/**
 * Filtro de streaming do texto livre do modelo (A5/A6). SEMPRE ligado: não
 * existe mais o booleano "reservado" que o destravava. É defesa adicional;
 * a autoridade sobre o que pode ser falado é `authorizeOutput` no servidor.
 */
export function createSchedulingReplyFilter(): BookingClaimFilter {
  return createBookingClaimFilter();
}

export function createSchedulingToolDefinitions(
  grant: PublishedToolGrant,
  port: SchedulingAgentPort,
): readonly [
  ToolDefinition<FindSlotsArguments, FindSlotsResult>,
  ToolDefinition<ConfirmOfferArguments, ConfirmOfferResult>,
] {
  const scope = schedulingScopeForGrant(grant);
  return [
    {
      name: SCHEDULING_FIND_SLOTS_TOOL,
      description:
        'Consulta a agenda e registra até 3 horários para oferecer. O servidor fala a lista; não invente horários.',
      validateInput: createZodToolValidator(findSlotsArgumentsSchema),
      execute: async (input, context) => {
        assertGrantContext(grant, context);
        return port.findSlots(scope, input);
      },
    },
    {
      name: SCHEDULING_CONFIRM_OFFER_TOOL,
      description:
        'Executa a marcação SOMENTE se o servidor já registrou a confirmação explícita do horário lido. O resultado é anunciado pelo servidor; não fale sobre a reserva.',
      validateInput: createZodToolValidator(confirmOfferArgumentsSchema),
      execute: async (_input, context) => {
        assertGrantContext(grant, context);
        return port.confirmOffer(scope);
      },
    },
  ];
}
