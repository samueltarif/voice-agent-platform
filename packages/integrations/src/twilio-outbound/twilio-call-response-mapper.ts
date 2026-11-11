import type {
  TelephonyOriginationResult,
  TelephonyReconciliationResult,
} from '@voice-agent/contracts';
import type { TwilioRestResponse } from './twilio-rest-transport.js';

/**
 * 008-OF5 (S2) — Tradução das respostas da Calls API para resultados neutros.
 * Regra central: só é REJECTED o que a documentação diz que NÃO criou chamada
 * (validação 4xx e 429 "aren't processed"). Qualquer dúvida é UNKNOWN, que
 * leva a OUTCOME_UNKNOWN e reconciliação — nunca rediscagem cega.
 *
 * Códigos (dicionário oficial de erros da Twilio, verificados em 2026-11-11):
 * 21211 Invalid 'To' Phone Number; 21215 Geo Permission não permite a chamada;
 * 21210 'From' não verificado; 20429 Too many requests (não processado).
 */
export const CALL_SID_PATTERN = /^CA[0-9a-f]{32}$/;

/** Status documentados do recurso Call. */
export const TWILIO_CALL_STATUSES = [
  'queued',
  'ringing',
  'in-progress',
  'canceled',
  'completed',
  'busy',
  'no-answer',
  'failed',
] as const;
export type TwilioCallStatus = (typeof TWILIO_CALL_STATUSES)[number];

const DESTINATION_CODES = new Set([21211, 21215]);
const CALLER_ID_CODES = new Set([21210]);

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function readCallSid(body: unknown): string | null {
  const sid = record(body)['sid'];
  return typeof sid === 'string' && CALL_SID_PATTERN.test(sid) ? sid : null;
}

export function readCallStatus(body: unknown): TwilioCallStatus | null {
  const status = record(body)['status'];
  return TWILIO_CALL_STATUSES.find((known) => known === status) ?? null;
}

function rejectionFor(status: number, body: unknown): TelephonyOriginationResult {
  if (status === 429) return { kind: 'REJECTED', reasonCode: 'LIMIT_EXCEEDED' };
  const code = record(body)['code'];
  if (typeof code === 'number' && DESTINATION_CODES.has(code)) {
    return { kind: 'REJECTED', reasonCode: 'DESTINATION_NOT_ALLOWED' };
  }
  if (typeof code === 'number' && CALLER_ID_CODES.has(code)) {
    return { kind: 'REJECTED', reasonCode: 'CALLER_IDENTITY_NOT_AUTHORIZED' };
  }
  return { kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' };
}

export function mapCreateCallResponse(response: TwilioRestResponse): TelephonyOriginationResult {
  if (response.kind === 'NO_RESPONSE') {
    return {
      kind: 'UNKNOWN',
      reasonCode: response.cause === 'TIMEOUT' ? 'TIMEOUT' : 'TRANSPORT_ERROR',
    };
  }
  return mapHttpCreateResponse(response.status, response.body);
}

function mapHttpCreateResponse(status: number, body: unknown): TelephonyOriginationResult {
  if (status === 200 || status === 201) {
    const sid = readCallSid(body);
    return sid
      ? { kind: 'ACCEPTED', providerReference: sid }
      : { kind: 'UNKNOWN', reasonCode: 'AMBIGUOUS_RESPONSE' };
  }
  if (status >= 400 && status < 500 && status !== 408) return rejectionFor(status, body);
  return { kind: 'UNKNOWN', reasonCode: status === 408 ? 'TIMEOUT' : 'AMBIGUOUS_RESPONSE' };
}

/** Consulta pelo `CallSid`: existir no provedor prova a originação; o resto é inconclusivo. */
export function mapFetchCallResponse(
  response: TwilioRestResponse,
  expectedSid: string,
): TelephonyReconciliationResult {
  if (response.kind !== 'HTTP' || response.status !== 200) return { kind: 'INCONCLUSIVE' };
  if (readCallSid(response.body) !== expectedSid || !readCallStatus(response.body)) {
    return { kind: 'INCONCLUSIVE' };
  }
  return { kind: 'CONFIRMED_ORIGINATED', providerReference: expectedSid };
}
