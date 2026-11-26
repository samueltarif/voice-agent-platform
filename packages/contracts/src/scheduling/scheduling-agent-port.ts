import { z } from 'zod';
import type { BookingProtocolDirective, BookingProtocolPhase } from './booking-protocol-types.js';
import type { SchedulingSessionContextQuery } from './scheduling-session-context.js';
import { isValidLocalDate } from './zoned-wall-time.js';

/**
 * E2 PR 2 (DEC-075) — porta das ferramentas de agendamento do agente.
 *
 * Autoridade: o escopo vem SÓ de uma concessão legítima (`PublishedToolGrant`)
 * — tenant, sessão (= `callId`), agente, versão e a agenda da versão capturada
 * como valor. Tentativa, job, telefone, contato, lead e agenda fixada são
 * derivados e revalidados no servidor, sob trava, no momento do efeito.
 * O modelo nunca fornece identificadores, booleanos de consentimento, ordinais
 * ou ids de turno: os argumentos aceitos estão abaixo e não têm autoridade.
 */

export const SCHEDULING_FIND_SLOTS_TOOL = 'scheduling.find_slots' as const;
export const SCHEDULING_CONFIRM_OFFER_TOOL = 'scheduling.confirm_offer' as const;
export const SCHEDULING_TOOL_NAMES = [
  SCHEDULING_FIND_SLOTS_TOOL,
  SCHEDULING_CONFIRM_OFFER_TOOL,
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

/** Confirmar não recebe NADA do modelo: o consentimento é o estado do protocolo. */
export const confirmOfferArgumentsSchema = z.object({}).strict();
export type ConfirmOfferArguments = z.infer<typeof confirmOfferArgumentsSchema>;

/** Motivo de não seguir; nunca expõe ids nem dados do lead. */
export type SchedulingRefusal =
  | 'CONTEXT_REFUSED'
  | 'SCHEDULING_UNAVAILABLE'
  | 'SESSION_NOT_ACTIVE'
  | 'OPT_OUT_REQUESTED'
  | 'OPT_OUT_CLARIFICATION_PENDING'
  | 'BOOKING_IN_FLIGHT'
  | 'ALREADY_BOOKED'
  | 'LEAD_NOT_BOOKABLE'
  | 'NOT_AUTHORIZED';

/** Motivo GROSSO de não reserva para o modelo (sem supressão, reunião ativa ou outros dados do lead). */
export type NotBookedReason =
  'SLOT_UNAVAILABLE' | 'OFFER_EXPIRED' | 'NOT_BOOKABLE' | 'TECHNICAL_FAILURE';

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
 * Resultado da confirmação. `mayAnnounceBooking` só é `true` com `BOOKED`
 * (reserva nova ou recuperada) conferida no banco para a MESMA oferta e com a
 * sessão ainda ativa. `UNKNOWN` = o commit pode ter ocorrido: não anunciar
 * nem sucesso nem fracasso; a próxima chamada reconcilia com a mesma chave.
 */
export type ConfirmOfferResult =
  | {
      readonly status: 'BOOKED';
      readonly recovered: boolean;
      readonly mayAnnounceBooking: true;
      readonly speech: string;
    }
  | {
      readonly status: 'NOT_BOOKED';
      readonly outcome: NotBookedReason;
      readonly mayAnnounceBooking: false;
      readonly speech: string;
    }
  | { readonly status: 'UNKNOWN'; readonly mayAnnounceBooking: false; readonly speech: string }
  | {
      readonly status: 'REFUSED';
      readonly reason: SchedulingRefusal;
      readonly mayAnnounceBooking: false;
      readonly speech: string;
    };

/** Eventos do HARNESS confiável (transporte/TTS), nunca do modelo. */
export type SchedulingSpeechEvent =
  | {
      readonly type: 'SPEECH_STARTED';
      readonly generationId: string;
      readonly purpose: 'PRESENTATION' | 'READBACK';
      readonly listRevision: number;
      readonly offerId?: string | undefined;
    }
  | {
      /** E2 PR 3: pergunta de esclarecimento de um POSSÍVEL opt-out (sim/não). */
      readonly type: 'SPEECH_STARTED';
      readonly generationId: string;
      readonly purpose: 'OPT_OUT_QUESTION';
    }
  | { readonly type: 'SPEECH_COMPLETED'; readonly generationId: string }
  | { readonly type: 'SPEECH_INTERRUPTED'; readonly generationId: string };

export interface SchedulingProtocolView {
  readonly phase: BookingProtocolPhase;
  readonly directives: readonly BookingProtocolDirective[];
  /** Texto determinístico que o harness deve falar (lista, releitura, resultado). */
  readonly speech: string | null;
  readonly ignored: string | null;
  /** Possível opt-out em esclarecimento: abordagem comercial e reserva bloqueadas. */
  readonly optOutClarificationPending: boolean;
  readonly refusal: SchedulingRefusal | null;
}

export interface SchedulingAgentPort {
  findSlots(scope: SchedulingAgentScope, args: FindSlotsArguments): Promise<FindSlotsResult>;
  confirmOffer(scope: SchedulingAgentScope): Promise<ConfirmOfferResult>;
  recordSpeech(
    scope: SchedulingAgentScope,
    event: SchedulingSpeechEvent,
  ): Promise<SchedulingProtocolView>;
  /** O interlocutor COMEÇOU a falar: o servidor atribui o `seq` de início. */
  recordLeadSpeechStarted(scope: SchedulingAgentScope): Promise<SchedulingProtocolView>;
  /** Fala FINAL do interlocutor: classificada no servidor (`classifyLeadReply`). */
  recordLeadUtterance(scope: SchedulingAgentScope, text: string): Promise<SchedulingProtocolView>;
}
