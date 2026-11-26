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

function assertContext(grant: PublishedToolGrant, context: ToolExecutionContext): void {
  const same =
    context.organizationId === grant.organizationId &&
    context.agentVersionId === grant.agentVersionId &&
    context.callId === grant.callId &&
    context.snapshot === grant.snapshot;
  if (!same) throw new Error(SCHEDULING_CONTEXT_MISMATCH_MESSAGE);
}

/**
 * Guarda da saída do modelo para UMA chamada (A5): frases sobre marcar,
 * agendar ou confirmar só passam depois que `confirm_offer` devolveu `BOOKED`
 * com `mayAnnounceBooking` (reunião conferida no banco e sessão ativa).
 */
export interface SchedulingReplyGuard {
  observe(result: ConfirmOfferResult): void;
  /** Filtro de streaming para o texto do modelo (ver `createBookingClaimFilter`). */
  createReplyFilter(): BookingClaimFilter;
}

export function createSchedulingReplyGuard(): SchedulingReplyGuard {
  let booked = false;
  return {
    observe(result) {
      if (result.status === 'BOOKED' && result.mayAnnounceBooking === true) booked = true;
    },
    createReplyFilter: () => createBookingClaimFilter(() => booked),
  };
}

export function createSchedulingToolDefinitions(
  grant: PublishedToolGrant,
  port: SchedulingAgentPort,
  guard?: SchedulingReplyGuard,
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
        assertContext(grant, context);
        return port.findSlots(scope, input);
      },
    },
    {
      name: SCHEDULING_CONFIRM_OFFER_TOOL,
      description:
        'Executa a marcação SOMENTE se o servidor já registrou a confirmação explícita do horário lido. Só anuncie se mayAnnounceBooking for true.',
      validateInput: createZodToolValidator(confirmOfferArgumentsSchema),
      execute: async (_input, context) => {
        assertContext(grant, context);
        const result = await port.confirmOffer(scope);
        guard?.observe(result);
        return result;
      },
    },
  ];
}
