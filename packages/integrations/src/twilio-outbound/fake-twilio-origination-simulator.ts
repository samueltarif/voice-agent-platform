import type {
  TwilioRestRequest,
  TwilioRestResponse,
  TwilioRestTransport,
} from './twilio-rest-transport.js';
import {
  buildFakeCallbackScript,
  type FakeCallbackDelivery,
  type FakeCallScenario,
} from './fake-twilio-callback-script.js';

/**
 * 008-OF5 (S2) — `FakeTwilioOriginationSimulator`: implementa a porta de
 * transporte REST 100% em memória (sem sockets, HTTP ou SDK). Registra cada
 * requisição para provar quantas originações foram emitidas e simula as
 * respostas documentadas da Calls API, inclusive a resposta PERDIDA depois de
 * a chamada existir (o caso que exige reconciliação e proíbe rediscagem).
 */
export type FakeCreateOutcome =
  | { readonly kind: 'ACCEPT' }
  | { readonly kind: 'ACCEPT_BUT_LOSE_RESPONSE'; readonly cause: 'TIMEOUT' | 'NETWORK' }
  | { readonly kind: 'REJECT'; readonly status: number; readonly code?: number }
  | { readonly kind: 'SERVER_ERROR'; readonly status: number }
  | { readonly kind: 'MALFORMED_SUCCESS' }
  | { readonly kind: 'UNREACHABLE'; readonly cause: 'TIMEOUT' | 'NETWORK' };

export interface FakeTwilioCall {
  readonly sid: string;
  readonly to: string;
  readonly from: string;
  readonly twiml: string;
  readonly statusCallback: string;
  status: string;
}

export const FAKE_TWILIO_AUTH_TOKEN = '0123456789abcdef0123456789abcdef';

function formValue(form: TwilioRestRequest['form'], key: string): string {
  return form?.find(([name]) => name === key)?.[1] ?? '';
}

function unescapeXmlAttribute(value: string): string {
  return value.replace(/&amp;/g, '&');
}

function twimlAttribute(twiml: string, pattern: RegExp): string {
  return unescapeXmlAttribute(pattern.exec(twiml)?.[1] ?? '');
}

export class FakeTwilioOriginationSimulator implements TwilioRestTransport {
  readonly requests: TwilioRestRequest[] = [];
  readonly calls = new Map<string, FakeTwilioCall>();
  private readonly outcomes: FakeCreateOutcome[] = [];
  private nextSid = 1;

  queueCreateOutcome(outcome: FakeCreateOutcome): void {
    this.outcomes.push(outcome);
  }

  /** Número de pedidos de criação de chamada recebidos (prova de "zero rediscagem"). */
  get createRequestCount(): number {
    return this.requests.filter((r) => r.method === 'POST' && r.path === '/Calls.json').length;
  }

  async send(request: TwilioRestRequest): Promise<TwilioRestResponse> {
    this.requests.push(request);
    if (request.path === '/Calls.json' && request.method === 'POST') return this.create(request);
    return this.fetchOrUpdate(request);
  }

  private fetchOrUpdate(request: TwilioRestRequest): TwilioRestResponse {
    const sid = /^\/Calls\/(CA[0-9a-f]{32})\.json$/.exec(request.path)?.[1];
    const call = sid ? this.calls.get(sid) : undefined;
    if (!call) return { kind: 'HTTP', status: 404, body: { code: 20404 } };
    if (request.method === 'POST' && formValue(request.form, 'Status') === 'completed') {
      call.status =
        call.status === 'queued' || call.status === 'ringing' ? 'canceled' : 'completed';
    }
    return { kind: 'HTTP', status: 200, body: { sid: call.sid, status: call.status } };
  }

  /** Callbacks assinados (token falso) que a "operadora" enviaria para este cenário. */
  callbacksFor(sid: string, scenario: FakeCallScenario, startedAt: Date): FakeCallbackDelivery[] {
    const call = this.calls.get(sid);
    if (!call) throw new Error('Chamada simulada inexistente.');
    const childSid = `CA${'c'.repeat(16)}${sid.slice(-16)}`;
    const urls = {
      callStatus: call.statusCallback,
      aiLegStatus: twimlAttribute(call.twiml, /<Sip [^>]*statusCallback="([^"]+)"/),
      aiLegResult: twimlAttribute(call.twiml, /<Dial [^>]*action="([^"]+)"/),
    };
    const script = { scenario, parentSid: sid, childSid, urls, startedAt };
    return buildFakeCallbackScript(script, FAKE_TWILIO_AUTH_TOKEN);
  }

  private create(request: TwilioRestRequest): TwilioRestResponse {
    const outcome = this.outcomes.shift() ?? { kind: 'ACCEPT' };
    if (outcome.kind === 'REJECT') {
      return { kind: 'HTTP', status: outcome.status, body: { code: outcome.code ?? null } };
    }
    if (outcome.kind === 'SERVER_ERROR') return { kind: 'HTTP', status: outcome.status, body: {} };
    if (outcome.kind === 'UNREACHABLE') return { kind: 'NO_RESPONSE', cause: outcome.cause };
    const call = this.register(request);
    if (outcome.kind === 'ACCEPT_BUT_LOSE_RESPONSE') {
      return { kind: 'NO_RESPONSE', cause: outcome.cause };
    }
    if (outcome.kind === 'MALFORMED_SUCCESS') return { kind: 'HTTP', status: 201, body: {} };
    return { kind: 'HTTP', status: 201, body: { sid: call.sid, status: call.status } };
  }

  private register(request: TwilioRestRequest): FakeTwilioCall {
    const sid = `CA${this.nextSid.toString(16).padStart(32, '0')}`;
    this.nextSid += 1;
    const call: FakeTwilioCall = {
      sid,
      to: formValue(request.form, 'To'),
      from: formValue(request.form, 'From'),
      twiml: formValue(request.form, 'Twiml'),
      statusCallback: formValue(request.form, 'StatusCallback'),
      status: 'queued',
    };
    this.calls.set(sid, call);
    return call;
  }
}
