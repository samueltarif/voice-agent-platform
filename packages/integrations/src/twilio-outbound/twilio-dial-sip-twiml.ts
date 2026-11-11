import { escapeXml } from '../twilio/twilio-twiml-generator.js';
import type { TwilioOutboundConfig } from './twilio-outbound-config.js';

/**
 * 008-OF5 (S2) — TwiML `<Response><Dial><Sip>` da chamada outbound Twilio-led.
 *
 * Garantias:
 * - o URI SIP vem SOMENTE da sessão conversacional preparada (servidor) e é
 *   recusado se tiver qualquer caractere fora do conjunto estrito abaixo;
 * - todo valor é escapado (sem injeção de XML) e o documento tem ≤ 4.000
 *   caracteres (limite documentado do parâmetro `Twiml`);
 * - `record="do-not-record"` explícito: a gravação real está DESLIGADA e, se um
 *   dia for habilitada, será no nível da chamada (nunca nos dois lugares);
 * - todos os URLs de callback levam o token opaco da tentativa em `t`.
 */
export const TWILIO_TWIML_MAX_LENGTH = 4_000;
/** Documentado no `<Sip>`: o URI deve ter menos de 255 caracteres. */
export const TWILIO_SIP_URI_MAX_LENGTH = 254;

const SIP_URI_PATTERN = /^sip:[A-Za-z0-9._~!$&'()*+,=%-]+@[A-Za-z0-9.-]+(:\d{1,5})?$/;
const CALLBACK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const TWILIO_CALLBACK_PATHS = {
  callStatus: '/v1/provider-webhooks/twilio/events',
  aiLegStatus: '/v1/provider-webhooks/twilio/ai-leg-status',
  aiLegResult: '/v1/provider-webhooks/twilio/ai-leg-result',
} as const;

export class UnsafeTwimlInputError extends Error {
  constructor(field: string) {
    super(`Entrada recusada para a TwiML: ${field}.`);
    this.name = 'UnsafeTwimlInputError';
  }
}

export interface DialSipTwimlInput {
  readonly config: TwilioOutboundConfig;
  /** URI devolvido pela sessão preparada; nunca vindo de requisição externa. */
  readonly sipUri: string;
  /** Token opaco da tentativa (já revelado só para montar os URLs). */
  readonly callbackToken: string;
}

/** URL de callback com o token da tentativa; o único parâmetro de query é `t`. */
export function buildTwilioCallbackUrl(
  config: TwilioOutboundConfig,
  path: string,
  callbackToken: string,
): string {
  if (!CALLBACK_TOKEN_PATTERN.test(callbackToken)) throw new UnsafeTwimlInputError('token');
  return `${config.callbackBaseUrl}${path}?t=${callbackToken}`;
}

/** URI final do `<Sip>`: URI da sessão + `region` e `transport` da configuração. */
export function buildSipTargetUri(config: TwilioOutboundConfig, sipUri: string): string {
  if (!SIP_URI_PATTERN.test(sipUri)) throw new UnsafeTwimlInputError('sipUri');
  const target = `${sipUri};region=${config.sipRegion};transport=${config.sipTransport}`;
  if (target.length > TWILIO_SIP_URI_MAX_LENGTH) throw new UnsafeTwimlInputError('sipUri');
  return target;
}

export function buildDialSipTwiml(input: DialSipTwimlInput): string {
  const { config, callbackToken } = input;
  const sipTarget = buildSipTargetUri(config, input.sipUri);
  const action = buildTwilioCallbackUrl(config, TWILIO_CALLBACK_PATHS.aiLegResult, callbackToken);
  const legStatus = buildTwilioCallbackUrl(
    config,
    TWILIO_CALLBACK_PATHS.aiLegStatus,
    callbackToken,
  );
  const twiml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
    `<Dial timeLimit="${config.maxCallDurationSeconds}" action="${escapeXml(action)}"` +
    ' method="POST" record="do-not-record">' +
    '<Sip statusCallbackEvent="initiated ringing answered completed"' +
    ` statusCallback="${escapeXml(legStatus)}" statusCallbackMethod="POST">` +
    `${escapeXml(sipTarget)}</Sip>` +
    '</Dial>' +
    '</Response>';
  if (twiml.length > TWILIO_TWIML_MAX_LENGTH) throw new UnsafeTwimlInputError('length');
  return twiml;
}
