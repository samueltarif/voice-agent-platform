import { z } from 'zod';
import type { SchedulingSessionContextQuery } from './scheduling-session-context.js';
import { isValidLocalDate } from './zoned-wall-time.js';

/**
 * E2 (DEC-075; simplificada pela DEC-077) — porta das ferramentas de
 * agendamento do agente, na conexão DIRETA telefonia → motor conversacional:
 * a plataforma só vê a EXECUÇÃO das ferramentas e o relatório pós-chamada.
 *
 * Autoridade: o escopo vem SÓ de uma concessão legítima (`PublishedToolGrant`)
 * — tenant, sessão (= `callId`), agente, versão e a agenda da versão capturada
 * como valor. Tentativa, job, telefone, contato, lead e agenda fixada são
 * derivados e revalidados no servidor, sob trava, no momento do efeito.
 * O modelo nunca fornece identificadores de tenant, lead ou oferta: os
 * argumentos aceitos estão abaixo e não têm autoridade.
 *
 * `scheduling.request_booking` NÃO reserva: registra uma intenção PENDENTE,
 * vinculada à oferta desta sessão. A reserva transacional só acontece depois
 * da validação do aceite no histórico pós-chamada (`post-call-evaluation`);
 * casos ambíguos vão para revisão humana.
 */

export const SCHEDULING_FIND_SLOTS_TOOL = 'scheduling.find_slots' as const;
export const SCHEDULING_REQUEST_BOOKING_TOOL = 'scheduling.request_booking' as const;
export const SCHEDULING_TOOL_NAMES = [
  SCHEDULING_FIND_SLOTS_TOOL,
  SCHEDULING_REQUEST_BOOKING_TOOL,
] as const;

export interface SchedulingAgentScope extends SchedulingSessionContextQuery {
  /** Agenda da versão publicada capturada na concessão (`null` = sem agenda na versão). */
  readonly grantCalendarId: string | null;
}

/** Preferência do interlocutor (sem autoridade): um dia local da agenda, ou os próximos dias. */
export const findSlotsArgumentsSchema = z
  .object({
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isValidLocalDate, 'Invalid local date')
      .optional(),
  })
  .strict();
export type FindSlotsArguments = z.infer<typeof findSlotsArgumentsSchema>;

/**
 * Pedido de agendamento: a lista e a opção ofertadas NESTA sessão. A frase do
 * interlocutor é só registro para revisão — nunca prova de aceite.
 */
export const requestBookingArgumentsSchema = z
  .object({
    listRevision: z.number().int().min(1),
    option: z.number().int().min(1).max(3),
    leadConfirmation: z.string().trim().min(1).max(300),
  })
  .strict();
export type RequestBookingArguments = z.infer<typeof requestBookingArgumentsSchema>;

/** Motivo de não seguir; nunca expõe ids nem dados do lead. */
export type SchedulingRefusal =
  | 'CONTEXT_REFUSED'
  | 'SCHEDULING_UNAVAILABLE'
  | 'SESSION_NOT_ACTIVE'
  | 'OPT_OUT_REQUESTED'
  | 'LEAD_NOT_BOOKABLE'
  | 'OFFER_NOT_CURRENT'
  | 'OFFER_EXPIRED';

export interface OfferedOption {
  readonly ordinal: number;
  /** Texto exato, renderizado pelo servidor, com data, hora e fuso. */
  readonly label: string;
}

export type FindSlotsResult =
  | {
      readonly status: 'OFFERED';
      readonly listRevision: number;
      /** `true` = retry técnico: mesma lista, mesmos ids, ordem e validade. */
      readonly retry: boolean;
      readonly options: readonly OfferedOption[];
      readonly speech: string;
    }
  | { readonly status: 'NO_AVAILABILITY'; readonly speech: string }
  | { readonly status: 'REFUSED'; readonly reason: SchedulingRefusal; readonly speech: string };

/**
 * `PENDING_CONFIRMATION`: intenção registrada; NADA foi reservado. O texto do
 * servidor diz isso ao interlocutor (a confirmação vem depois da ligação).
 */
export type RequestBookingResult =
  | {
      readonly status: 'PENDING_CONFIRMATION';
      readonly listRevision: number;
      readonly option: number;
      readonly speech: string;
    }
  | { readonly status: 'REFUSED'; readonly reason: SchedulingRefusal; readonly speech: string };

export interface SchedulingAgentPort {
  findSlots(scope: SchedulingAgentScope, args: FindSlotsArguments): Promise<FindSlotsResult>;
  requestBooking(
    scope: SchedulingAgentScope,
    args: RequestBookingArguments,
  ): Promise<RequestBookingResult>;
}
