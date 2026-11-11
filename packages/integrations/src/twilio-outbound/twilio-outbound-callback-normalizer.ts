import {
  aiAgentLegResultEventSchema,
  callLegStatusEventSchema,
  type AiAgentLegResultEvent,
  type CallLegState,
  type CallLegStatusEvent,
} from '@voice-agent/contracts';
import { CALL_SID_PATTERN } from './twilio-call-response-mapper.js';

/**
 * 008-OF5 (S2) — Callbacks JÁ AUTENTICADOS (assinatura válida) e com tentativa
 * resolvida pelo token `t` no servidor. O tenant vem da tentativa, nunca do
 * payload. Qualquer campo fora do documentado ⇒ `null` (quarentena auditada).
 *
 * Endpoints (um papel por URL assinado — não forjável):
 * - CALL_STATUS: `StatusCallback` da chamada pai (perna do contato);
 * - AI_LEG_STATUS: `statusCallback` do `<Sip>` (perna filha do agente de IA);
 * - AI_LEG_RESULT: `action` do `<Dial>` (`DialCallStatus`, `DialSipResponseCode`).
 */
export type TwilioCallbackEndpoint = 'CALL_STATUS' | 'AI_LEG_STATUS' | 'AI_LEG_RESULT';

export interface ResolvedAttemptContext {
  readonly organizationId: string;
  readonly attemptId: string;
}

export interface TwilioCallbackInput {
  readonly endpoint: TwilioCallbackEndpoint;
  readonly params: Readonly<Record<string, string>>;
  readonly attempt: ResolvedAttemptContext;
  readonly receivedAt: Date;
}

export type NormalizedTwilioCallback = CallLegStatusEvent | AiAgentLegResultEvent;

const LEG_STATES: Readonly<Record<string, CallLegState>> = {
  queued: 'INITIATED',
  initiated: 'INITIATED',
  ringing: 'RINGING',
  answered: 'ANSWERED',
  'in-progress': 'ANSWERED',
  completed: 'COMPLETED',
  busy: 'BUSY',
  'no-answer': 'NO_ANSWER',
  failed: 'FAILED',
  canceled: 'CANCELED',
};

const BRIDGE_STATUSES: Readonly<Record<string, AiAgentLegResultEvent['bridgeStatus']>> = {
  completed: 'COMPLETED',
  answered: 'CONNECTED',
  busy: 'BUSY',
  'no-answer': 'NO_ANSWER',
  failed: 'FAILED',
  canceled: 'CANCELED',
};

function occurredAt(params: Readonly<Record<string, string>>, receivedAt: Date): string {
  const parsed = params['Timestamp'] ? Date.parse(params['Timestamp']) : Number.NaN;
  return new Date(Number.isNaN(parsed) ? receivedAt.getTime() : parsed).toISOString();
}

function sequence(raw: string | undefined): number | null {
  return raw !== undefined && /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

function sid(raw: string | undefined): string | null {
  return raw !== undefined && CALL_SID_PATTERN.test(raw) ? raw : null;
}

function hasRequiredLegFields(
  state: CallLegState | undefined,
  reference: string | null,
  parent: string | null,
): boolean {
  return Boolean(state && reference && parent);
}

function legStatus(input: TwilioCallbackInput, aiLeg: boolean): CallLegStatusEvent | null {
  const { params } = input;
  const state = LEG_STATES[params['CallStatus'] ?? ''];
  const reference = sid(params['CallSid']);
  const parent = sid(params['ParentCallSid']);
  if (!hasRequiredLegFields(state, reference, aiLeg ? parent : 'not-required')) return null;
  const parsed = callLegStatusEventSchema.safeParse({
    type: 'CALL_LEG_STATUS',
    ...input.attempt,
    occurredAt: occurredAt(params, input.receivedAt),
    sequence: sequence(params['SequenceNumber']),
    role: aiLeg ? 'AI_AGENT_LEG' : 'CONTACT_LEG',
    providerLegReference: reference,
    parentLegReference: aiLeg ? parent : null,
    state,
  });
  return parsed.success ? parsed.data : null;
}

function aiLegResult(input: TwilioCallbackInput): AiAgentLegResultEvent | null {
  const { params } = input;
  const bridgeStatus = BRIDGE_STATUSES[params['DialCallStatus'] ?? ''];
  if (!bridgeStatus || !sid(params['CallSid'])) return null;
  const rawCode = params['DialSipResponseCode'];
  const code = rawCode !== undefined && /^\d{3}$/.test(rawCode) ? Number(rawCode) : undefined;
  const parsed = aiAgentLegResultEventSchema.safeParse({
    type: 'AI_AGENT_LEG_RESULT',
    ...input.attempt,
    occurredAt: occurredAt(params, input.receivedAt),
    sequence: null,
    providerLegReference: sid(params['DialCallSid']),
    bridgeStatus,
    ...(code !== undefined ? { transportResponseCode: code } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export function normalizeTwilioOutboundCallback(
  input: TwilioCallbackInput,
): NormalizedTwilioCallback | null {
  if (input.endpoint === 'AI_LEG_RESULT') return aiLegResult(input);
  return legStatus(input, input.endpoint === 'AI_LEG_STATUS');
}

/**
 * Resposta ao `action` do `<Dial>`: SEMPRE desligar, para nunca deixar a linha
 * em silêncio. A variante com mensagem pré-gravada depende da decisão
 * D-SIP-FAIL (não tomada) e não está implementada.
 */
export function buildDialActionTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
}
