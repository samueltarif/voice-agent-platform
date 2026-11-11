import {
  e164DestinationSchema,
  type TelephonyOriginationPort,
  type TelephonyOriginationRequest,
  type TelephonyOriginationResult,
  type TelephonyReconciliationPort,
  type TelephonyReconciliationRequest,
  type TelephonyReconciliationResult,
} from '@voice-agent/contracts';
import {
  CALL_SID_PATTERN,
  mapCreateCallResponse,
  mapFetchCallResponse,
  readCallStatus,
} from './twilio-call-response-mapper.js';
import {
  buildDialSipTwiml,
  buildTwilioCallbackUrl,
  TWILIO_CALLBACK_PATHS,
} from './twilio-dial-sip-twiml.js';
import type { TwilioOutboundConfig } from './twilio-outbound-config.js';
import type { TwilioRestResponse, TwilioRestTransport } from './twilio-rest-transport.js';

/**
 * 008-OF5 (S2) — Originação outbound Twilio-led: Calls API com TwiML inline
 * `<Dial><Sip>` para a sessão conversacional JÁ preparada (variante R1).
 * AUTORIDADE ÚNICA de originação: o motor conversacional nunca disca.
 * AMD desligado (sem `MachineDetection`) e gravação desligada (sem `Record`).
 */
export interface TwilioDialContext {
  /** Número de origem escolhido pelo servidor para a organização. */
  readonly callerId: string;
  /** URI SIP da sessão preparada e persistida (nunca de requisição externa). */
  readonly sipUri: string;
  /** Token opaco da tentativa, revelado só para montar os URLs assinados. */
  readonly callbackToken: string;
}

export interface TwilioOutboundAdapterDependencies {
  readonly config: TwilioOutboundConfig;
  readonly transport: TwilioRestTransport;
  /** Contexto server-side da tentativa; `null` = tentativa sem sessão preparada. */
  readonly resolveDialContext: (
    request: TelephonyOriginationRequest,
  ) => Promise<TwilioDialContext | null>;
}

export type TwilioHangUpResult = 'ENDED' | 'NOT_FOUND' | 'UNKNOWN';

const STATUS_EVENTS = ['initiated', 'ringing', 'answered', 'completed'] as const;

export function buildCreateCallForm(
  config: TwilioOutboundConfig,
  context: TwilioDialContext,
  destination: string,
): ReadonlyArray<readonly [string, string]> {
  const twiml = buildDialSipTwiml({
    config,
    sipUri: context.sipUri,
    callbackToken: context.callbackToken,
  });
  const statusUrl = buildTwilioCallbackUrl(
    config,
    TWILIO_CALLBACK_PATHS.callStatus,
    context.callbackToken,
  );
  return [
    ['To', destination],
    ['From', context.callerId],
    ['Twiml', twiml],
    ['Timeout', String(config.ringTimeoutSeconds)],
    ['TimeLimit', String(config.maxCallDurationSeconds)],
    ['StatusCallback', statusUrl],
    ['StatusCallbackMethod', 'POST'],
    ...STATUS_EVENTS.map((event) => ['StatusCallbackEvent', event] as const),
  ];
}

function mapHangUpResponse(response: TwilioRestResponse): TwilioHangUpResult {
  if (response.kind !== 'HTTP') return 'UNKNOWN';
  if (response.status === 404) return 'NOT_FOUND';
  const status = response.status === 200 ? readCallStatus(response.body) : null;
  return status === 'completed' || status === 'canceled' ? 'ENDED' : 'UNKNOWN';
}

export class TwilioOutboundOriginationAdapter
  implements TelephonyOriginationPort, TelephonyReconciliationPort
{
  readonly providerName = 'twilio-outbound-sip';

  constructor(private readonly deps: TwilioOutboundAdapterDependencies) {}

  async originate(request: TelephonyOriginationRequest): Promise<TelephonyOriginationResult> {
    const { config, transport } = this.deps;
    if (!config.enabled) return { kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' };
    if (!e164DestinationSchema.safeParse(request.destination).success) {
      return { kind: 'REJECTED', reasonCode: 'DESTINATION_NOT_ALLOWED' };
    }
    const context = await this.deps.resolveDialContext(request);
    if (!context) return { kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' };
    if (!config.authorizedCallerIds.includes(context.callerId)) {
      return { kind: 'REJECTED', reasonCode: 'CALLER_IDENTITY_NOT_AUTHORIZED' };
    }
    let form: ReadonlyArray<readonly [string, string]>;
    try {
      form = buildCreateCallForm(config, context, request.destination);
    } catch {
      return { kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' };
    }
    try {
      return mapCreateCallResponse(
        await transport.send({ method: 'POST', path: '/Calls.json', form }),
      );
    } catch {
      return { kind: 'UNKNOWN', reasonCode: 'TRANSPORT_ERROR' };
    }
  }

  /** Sem `CallSid`, a listagem por número/data não identifica a tentativa: inconclusivo. */
  async reconcile(request: TelephonyReconciliationRequest): Promise<TelephonyReconciliationResult> {
    const sid = request.providerReference;
    if (!this.deps.config.enabled || !sid || !CALL_SID_PATTERN.test(sid)) {
      return { kind: 'INCONCLUSIVE' };
    }
    try {
      return mapFetchCallResponse(
        await this.deps.transport.send({ method: 'GET', path: `/Calls/${sid}.json` }),
        sid,
      );
    } catch {
      return { kind: 'INCONCLUSIVE' };
    }
  }

  /** Encerramento idempotente da perna pai (`Status=completed`). */
  async hangUp(callSid: string): Promise<TwilioHangUpResult> {
    if (!this.deps.config.enabled || !CALL_SID_PATTERN.test(callSid)) return 'UNKNOWN';
    try {
      const response = await this.deps.transport.send({
        method: 'POST',
        path: `/Calls/${callSid}.json`,
        form: [['Status', 'completed']],
      });
      return mapHangUpResponse(response);
    } catch {
      return 'UNKNOWN';
    }
  }
}
