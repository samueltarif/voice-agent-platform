import { createHmac } from 'node:crypto';
import { buildTwilioSignaturePayload } from '../twilio/twilio-signature-validator.js';
import type { TwilioCallbackEndpoint } from './twilio-outbound-callback-normalizer.js';

/**
 * 008-OF5 (S2) — Roteiros determinísticos de callbacks da chamada outbound,
 * assinados com um Auth Token FALSO (só para testes offline). Os nomes de
 * parâmetros seguem a documentação (`CallSid`, `ParentCallSid`, `CallStatus`,
 * `SequenceNumber`, `Timestamp`, `DialCallStatus`, `DialCallSid`,
 * `DialSipResponseCode`, `DialSipCallId`).
 */
export type FakeCallScenario =
  | 'ANSWERED_AND_COMPLETED'
  | 'BUSY'
  | 'NO_ANSWER'
  | 'FAILED'
  | 'ANSWERED_THEN_SIP_FAILURE'
  | 'CONTACT_HUNG_UP_FIRST'
  | 'AI_SESSION_ENDED_FIRST';

export interface FakeCallbackDelivery {
  readonly endpoint: TwilioCallbackEndpoint;
  readonly url: string;
  readonly params: Readonly<Record<string, string>>;
  readonly signature: string;
}

export interface FakeCallbackUrls {
  readonly callStatus: string;
  readonly aiLegStatus: string;
  readonly aiLegResult: string;
}

export interface FakeScriptInput {
  readonly scenario: FakeCallScenario;
  readonly parentSid: string;
  readonly childSid: string;
  readonly urls: FakeCallbackUrls;
  readonly startedAt: Date;
}

type Step = readonly [TwilioCallbackEndpoint, Record<string, string>];

function parent(status: string): Step {
  return ['CALL_STATUS', { CallStatus: status }];
}

function child(status: string): Step {
  return ['AI_LEG_STATUS', { CallStatus: status }];
}

function dialResult(status: string, sipCode: string): Step {
  return ['AI_LEG_RESULT', { DialCallStatus: status, DialSipResponseCode: sipCode }];
}

const BRIDGED: readonly Step[] = [
  parent('initiated'),
  parent('ringing'),
  parent('in-progress'),
  child('initiated'),
  child('ringing'),
  child('in-progress'),
];

const SCRIPTS: Readonly<Record<FakeCallScenario, readonly Step[]>> = {
  ANSWERED_AND_COMPLETED: [
    ...BRIDGED,
    child('completed'),
    dialResult('completed', '200'),
    parent('completed'),
  ],
  BUSY: [parent('initiated'), parent('ringing'), parent('busy')],
  NO_ANSWER: [parent('initiated'), parent('ringing'), parent('no-answer')],
  FAILED: [parent('initiated'), parent('failed')],
  ANSWERED_THEN_SIP_FAILURE: [
    parent('initiated'),
    parent('ringing'),
    parent('in-progress'),
    child('initiated'),
    child('failed'),
    dialResult('failed', '480'),
    parent('completed'),
  ],
  CONTACT_HUNG_UP_FIRST: [...BRIDGED, parent('completed'), child('completed')],
  AI_SESSION_ENDED_FIRST: [
    ...BRIDGED,
    child('completed'),
    dialResult('completed', '200'),
    parent('completed'),
  ],
};

/** Assinatura `X-Twilio-Signature` com o token falso do simulador. */
export function signFakeTwilioCallback(
  authToken: string,
  url: string,
  params: Readonly<Record<string, string>>,
): string {
  return createHmac('sha1', authToken)
    .update(buildTwilioSignaturePayload(url, params), 'utf8')
    .digest('base64');
}

function paramsFor(input: FakeScriptInput, step: Step, index: number): Record<string, string> {
  const [endpoint, extra] = step;
  const timestamp = new Date(input.startedAt.getTime() + index * 1_000).toUTCString();
  if (endpoint === 'CALL_STATUS') {
    return {
      CallSid: input.parentSid,
      SequenceNumber: String(index),
      Timestamp: timestamp,
      ...extra,
    };
  }
  if (endpoint === 'AI_LEG_STATUS') {
    const base = { CallSid: input.childSid, ParentCallSid: input.parentSid };
    return { ...base, SequenceNumber: String(index), Timestamp: timestamp, ...extra };
  }
  const sipCallId = `fake-sip-call-id-${input.childSid.slice(2, 10)}`;
  return {
    CallSid: input.parentSid,
    DialCallSid: input.childSid,
    DialSipCallId: sipCallId,
    ...extra,
  };
}

export function buildFakeCallbackScript(
  input: FakeScriptInput,
  authToken: string,
): FakeCallbackDelivery[] {
  const urls: Readonly<Record<TwilioCallbackEndpoint, string>> = {
    CALL_STATUS: input.urls.callStatus,
    AI_LEG_STATUS: input.urls.aiLegStatus,
    AI_LEG_RESULT: input.urls.aiLegResult,
  };
  return SCRIPTS[input.scenario].map((step, index) => {
    const params = paramsFor(input, step, index);
    const url = urls[step[0]];
    return {
      endpoint: step[0],
      url,
      params,
      signature: signFakeTwilioCallback(authToken, url, params),
    };
  });
}
