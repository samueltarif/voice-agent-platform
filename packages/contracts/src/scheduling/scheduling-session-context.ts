/**
 * E2 PR 1 (DEC-075) — contexto CONFIÁVEL de agendamento de uma sessão de
 * chamada, resolvido EXCLUSIVAMENTE no servidor a partir do vínculo durável
 * sessão ↔ tentativa (`call_sessions.current_attempt_id` e
 * `call_attempts.call_session_id`). Nunca recebe ids do modelo.
 *
 * Identidades distintas, nunca confundidas:
 * - `sessionId` = `call_sessions.id` (é o `callId` da concessão);
 * - `attemptId` = `call_attempts.id`; `jobId` = `outbound_call_jobs.id`;
 * - a referência do provedor (`providerCallReference`) NÃO participa.
 */

export const SCHEDULING_CALENDAR_SOURCES = [
  'CAMPAIGN',
  'AGENT_VERSION',
  'ORGANIZATION_DEFAULT',
] as const;
export type SchedulingCalendarSource = (typeof SCHEDULING_CALENDAR_SOURCES)[number];

/**
 * D1 — prioridade campanha → versão publicada (fixada na sessão) → padrão
 * explícito da empresa. Só a AUSÊNCIA de configuração permite cair para a
 * próxima; configuração explícita inválida/excluída/de outro tenant BLOQUEIA.
 */
export type SchedulingCalendarResolution =
  | {
      readonly kind: 'RESOLVED';
      readonly calendarId: string;
      readonly source: SchedulingCalendarSource;
    }
  | { readonly kind: 'ABSENT' }
  | {
      readonly kind: 'BLOCKED';
      readonly source: SchedulingCalendarSource;
      readonly reason: 'CALENDAR_NOT_FOUND' | 'AGENT_CONFIGURATION_INVALID';
    };

export type SchedulingUnavailableReason =
  'SESSION_NOT_ACTIVE' | 'NO_LEAD_FOR_DESTINATION' | 'CALENDAR_ABSENT' | 'CALENDAR_BLOCKED';

/** Vínculo de identidade verificado: basta para o OPT-OUT (destinatário certo). */
export interface SchedulingSessionBinding {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly campaignId: string | null;
  readonly agentId: string;
  readonly agentVersionId: string;
  /** Destino discado (E.164). Interno: nunca vai ao modelo nem a logs. */
  readonly destinationPhoneE164: string;
}

export type SchedulingCapability =
  | {
      readonly kind: 'AVAILABLE';
      readonly leadId: string;
      readonly calendarId: string;
      readonly calendarSource: SchedulingCalendarSource;
    }
  | { readonly kind: 'UNAVAILABLE'; readonly reason: SchedulingUnavailableReason };

export type SchedulingContextRefusal =
  | 'SESSION_NOT_FOUND'
  | 'AGENT_MISMATCH'
  | 'AGENT_VERSION_MISMATCH'
  | 'ATTEMPT_NOT_BOUND'
  | 'ATTEMPT_STATE_INCOMPATIBLE';

export type SchedulingSessionContext =
  | { readonly kind: 'REFUSED'; readonly reason: SchedulingContextRefusal }
  | {
      readonly kind: 'BOUND';
      readonly binding: SchedulingSessionBinding;
      /** D2 — capacidade de segurança: sempre presente quando o vínculo é verificado. */
      readonly optOut: { readonly available: true };
      readonly scheduling: SchedulingCapability;
      readonly calendar: SchedulingCalendarResolution;
    };

/** Identidade vinda SÓ de uma concessão legítima (`PublishedToolGrant`). */
export interface SchedulingSessionContextQuery {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
}

export interface SchedulingSessionContextPort {
  resolve(query: SchedulingSessionContextQuery): Promise<SchedulingSessionContext>;
}

/** Regra pura: agendamento exige sessão ATIVA, lead do destino e agenda resolvida. */
export function schedulingCapabilityFor(input: {
  readonly sessionActive: boolean;
  readonly leadId: string | null;
  readonly calendar: SchedulingCalendarResolution;
}): SchedulingCapability {
  if (!input.sessionActive) return { kind: 'UNAVAILABLE', reason: 'SESSION_NOT_ACTIVE' };
  if (input.calendar.kind === 'BLOCKED') return { kind: 'UNAVAILABLE', reason: 'CALENDAR_BLOCKED' };
  if (input.calendar.kind === 'ABSENT') return { kind: 'UNAVAILABLE', reason: 'CALENDAR_ABSENT' };
  if (!input.leadId) return { kind: 'UNAVAILABLE', reason: 'NO_LEAD_FOR_DESTINATION' };
  return {
    kind: 'AVAILABLE',
    leadId: input.leadId,
    calendarId: input.calendar.calendarId,
    calendarSource: input.calendar.source,
  };
}
