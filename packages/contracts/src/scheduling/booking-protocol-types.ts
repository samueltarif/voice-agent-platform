import type { LeadReplyIntent } from './lead-reply-intent.js';

/**
 * E2 PR 1 (DEC-075) — protocolo de agendamento CONTROLADO PELO SERVIDOR:
 * consulta → apresentação completa → seleção → releitura exata → entrega
 * completa da releitura → resposta final elegível → autorização (uso único)
 * → reserva persistida → comunicação do sucesso.
 *
 * Todo evento vem do servidor ou do transporte e recebe um `seq` monotônico
 * por sessão, atribuído pelo servidor. Nada produzido pelo modelo (booleanos,
 * ordinais, ids de turno, "o cliente confirmou") é evento deste protocolo.
 */
export const BOOKING_PROTOCOL_PHASES = [
  'IDLE',
  'PRESENTING',
  'AWAITING_SELECTION',
  'READBACK_PENDING',
  'READBACK_SPEAKING',
  'AWAITING_CONFIRMATION',
  'AUTHORIZED',
  'BOOKING',
  'BOOKED',
  'OPTED_OUT',
  'CLOSED',
] as const;
export type BookingProtocolPhase = (typeof BOOKING_PROTOCOL_PHASES)[number];

/** Oferta registrada pelo servidor (E1 `meeting_slot_offers`), na ordem apresentada. */
export interface ProtocolOffer {
  readonly offerId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly expiresAt: string;
}

export interface ProtocolOfferList {
  /** Revisão monotônica da lista na sessão: identifica a lista sem ambiguidade. */
  readonly revision: number;
  /** Chave da consulta; retry técnico da mesma consulta repete revisão e chave. */
  readonly queryKey: string;
  readonly offers: readonly ProtocolOffer[];
}

interface Spoken {
  readonly generationId: string;
  /** `seq` do evento de entrega COMPLETA; `null` enquanto não houver. */
  readonly deliveredSeq: number | null;
}

export interface BookingAuthorization {
  readonly authorizationId: string;
  readonly offerId: string;
  readonly listRevision: number;
  readonly utteranceSeq: number;
  readonly consumed: boolean;
}

export interface BookingProtocolState {
  readonly phase: BookingProtocolPhase;
  readonly lastSeq: number;
  readonly list: ProtocolOfferList | null;
  readonly presentation: Spoken | null;
  readonly selection: { readonly offerId: string; readonly ordinal: number } | null;
  readonly readback: (Spoken & { readonly offerId: string }) | null;
  readonly authorization: BookingAuthorization | null;
  readonly clarifications: number;
  readonly meetingId: string | null;
  /** Maior revisão de lista já vista: lista descartada nunca volta (auditoria M1). */
  readonly maxRevision: number;
  /** `seq` do pedido de opt-out reconhecido; preservado após o encerramento (A3). */
  readonly optOutSeq: number | null;
}

type SpeechPurpose = 'PRESENTATION' | 'READBACK';
type Base = { readonly seq: number; readonly at: string };

export type BookingProtocolEvent = Base &
  (
    | { readonly type: 'OFFER_LIST_ISSUED'; readonly list: ProtocolOfferList }
    | {
        readonly type: 'SPEECH_STARTED';
        readonly generationId: string;
        readonly purpose: SpeechPurpose;
        readonly listRevision: number;
        readonly offerId?: string | undefined;
      }
    | { readonly type: 'SPEECH_COMPLETED'; readonly generationId: string }
    | { readonly type: 'SPEECH_INTERRUPTED'; readonly generationId: string }
    | {
        readonly type: 'LEAD_FINAL_UTTERANCE';
        /** `seq` em que o interlocutor COMEÇOU a falar (associação temporal). */
        readonly startedSeq: number;
        /** Intenção classificada pelo servidor (`classifyLeadReply`). */
        readonly intent: LeadReplyIntent;
      }
    | { readonly type: 'AUTHORIZATION_CONSUMED'; readonly authorizationId: string }
    | {
        readonly type: 'BOOKING_RESULT';
        readonly authorizationId: string;
        readonly outcome: string;
        /** Reunião conferida no banco para ESTA oferta; `null` se não houver. */
        readonly verifiedMeeting: { readonly meetingId: string; readonly offerId: string } | null;
      }
    | { readonly type: 'CLOCK' }
    | { readonly type: 'SESSION_CLOSED' }
  );

export type BookingProtocolDirective =
  | { readonly kind: 'PRESENT_LIST'; readonly listRevision: number }
  | { readonly kind: 'READ_BACK'; readonly offerId: string; readonly listRevision: number }
  | { readonly kind: 'ASK_CLARIFICATION' }
  | { readonly kind: 'REQUEST_NEW_LIST' }
  | { readonly kind: 'RECORD_OPT_OUT' }
  | { readonly kind: 'BOOK'; readonly authorization: BookingAuthorization }
  | { readonly kind: 'ANNOUNCE_BOOKED'; readonly meetingId: string }
  | { readonly kind: 'ANNOUNCE_NOT_BOOKED'; readonly outcome: string };

export type BookingProtocolIgnoreReason =
  | 'DUPLICATE_OR_OUT_OF_ORDER'
  | 'TERMINAL_PHASE'
  | 'RETRY_SAME_LIST'
  | 'STALE_LIST'
  | 'STALE_GENERATION'
  | 'UNEXPECTED_IN_PHASE'
  | 'UTTERANCE_BEFORE_DELIVERY'
  | 'AUTHORIZATION_MISMATCH'
  | 'BOOKING_IN_FLIGHT';

export interface BookingProtocolStep {
  readonly state: BookingProtocolState;
  readonly directives: readonly BookingProtocolDirective[];
  readonly ignored?: BookingProtocolIgnoreReason | undefined;
}

export const INITIAL_BOOKING_PROTOCOL_STATE: BookingProtocolState = Object.freeze({
  phase: 'IDLE',
  lastSeq: 0,
  list: null,
  presentation: null,
  selection: null,
  readback: null,
  authorization: null,
  clarifications: 0,
  meetingId: null,
  maxRevision: 0,
  optOutSeq: null,
});

/** Esclarecimentos seguidos antes de desistir da lista (regra conservadora). */
export const MAX_CLARIFICATIONS = 2;
export const MAX_OFFERS_PER_LIST = 3;
export const OFFER_TTL_MINUTES = 15;
