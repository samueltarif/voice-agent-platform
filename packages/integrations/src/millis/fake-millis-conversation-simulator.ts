import type {
  MillisHttpRequest,
  MillisHttpResponse,
  MillisHttpTransport,
} from './millis-http-transport.js';
import { isAllowedMillisPath } from './millis-http-transport.js';

/**
 * 008-OF5 (S3) — `FakeMillisConversationSimulator`: transporte Millis 100% em
 * memória. Respostas roteirizadas para `register_sip_call` (inclusive as duas
 * grafias do URI encontradas na documentação e respostas ambíguas), sessões
 * com `call_status` do enum oficial, encerramento e consulta de call-logs.
 */
export type FakeRegisterOutcome =
  | { readonly kind: 'OK'; readonly uriKey: 'sip_uri' | 'sip'; readonly withSessionId: boolean }
  | { readonly kind: 'CONFLICTING_URIS' }
  | { readonly kind: 'MISSING_URI' }
  | { readonly kind: 'UNSAFE_URI' }
  | { readonly kind: 'HTTP_ERROR'; readonly status: number }
  | { readonly kind: 'NO_RESPONSE'; readonly cause: 'TIMEOUT' | 'NETWORK' }
  | { readonly kind: 'GARBAGE' };

export interface FakeMillisSession {
  readonly callId: string;
  readonly sessionId: string;
  readonly sipUri: string;
  readonly requestBody: unknown;
  callStatus: string;
}

export class FakeMillisConversationSimulator implements MillisHttpTransport {
  readonly requests: MillisHttpRequest[] = [];
  readonly sessions = new Map<string, FakeMillisSession>();
  private readonly outcomes: FakeRegisterOutcome[] = [];
  private counter = 0;

  queueRegisterOutcome(outcome: FakeRegisterOutcome): void {
    this.outcomes.push(outcome);
  }

  get registerCount(): number {
    return this.requests.filter((request) => request.path === '/register_sip_call').length;
  }

  /** Simula o fim da conversa pelo motor (ex.: `agent-ended`, `user-ended`). */
  endSession(sessionId: string, callStatus: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.callStatus = callStatus;
  }

  async send(request: MillisHttpRequest): Promise<MillisHttpResponse> {
    this.requests.push(request);
    if (!isAllowedMillisPath(request.path)) return { kind: 'HTTP', status: 404, body: null };
    if (request.path === '/register_sip_call') return this.register(request.body);
    const sessionId = request.path.split('/')[2]!;
    const session = this.sessions.get(sessionId);
    if (!session) return { kind: 'HTTP', status: 404, body: { detail: 'not found' } };
    if (request.path.endsWith('/terminate')) session.callStatus = 'api-ended';
    return { kind: 'HTTP', status: 200, body: this.callLog(session) };
  }

  private callLog(session: FakeMillisSession): Record<string, unknown> {
    return {
      session_id: session.sessionId,
      call_id: session.callId,
      call_status: session.callStatus,
    };
  }

  private register(body: unknown): MillisHttpResponse {
    const outcome = this.outcomes.shift() ?? { kind: 'OK', uriKey: 'sip_uri', withSessionId: true };
    if (outcome.kind === 'HTTP_ERROR')
      return { kind: 'HTTP', status: outcome.status, body: { detail: [] } };
    if (outcome.kind === 'NO_RESPONSE') return { kind: 'NO_RESPONSE', cause: outcome.cause };
    if (outcome.kind === 'GARBAGE') return { kind: 'HTTP', status: 200, body: 'ok' };
    const session = this.createSession(body);
    return { kind: 'HTTP', status: 200, body: this.registrationBody(outcome, session) };
  }

  private registrationBody(outcome: FakeRegisterOutcome, session: FakeMillisSession): unknown {
    const ids = { call_id: session.callId, session_id: session.sessionId };
    if (outcome.kind === 'CONFLICTING_URIS') {
      return { ...ids, sip_uri: session.sipUri, sip: 'sip:other@sip.millis.example.test' };
    }
    if (outcome.kind === 'MISSING_URI') return ids;
    if (outcome.kind === 'UNSAFE_URI') return { ...ids, sip_uri: `${session.sipUri};x=1` };
    if (outcome.kind !== 'OK') return ids;
    const base = outcome.withSessionId ? ids : { call_id: session.callId };
    return { ...base, [outcome.uriKey]: session.sipUri };
  }

  private createSession(body: unknown): FakeMillisSession {
    this.counter += 1;
    const id = this.counter.toString().padStart(6, '0');
    const session = {
      callId: `call_${id}`,
      sessionId: `sess_${id}`,
      sipUri: `sip:call-${id}@sip.millis.example.test`,
      requestBody: body,
      callStatus: 'registered',
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }
}
