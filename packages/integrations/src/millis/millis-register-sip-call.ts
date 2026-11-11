/**
 * 008-OF5 (S3) — `POST /register_sip_call` (Millis AI).
 *
 * O que está DOCUMENTADO (OpenAPI, 2026-11-11): corpo `InitAgent` com
 * `agent_id`, `agent_config`, `metadata`, `include_metadata_in_prompt`,
 * `from_phone`, `to_phone`, `session_continuation` — nenhum obrigatório.
 *
 * O que é PROVIDER_UNVERIFIED: o schema da resposta 200 é VAZIO (`{}`) no
 * OpenAPI. A página SIP diz em prosa que a resposta traz `call_id` e
 * `sip_uri`, mas o exemplo usa a chave `"sip"`. Não há campo de validade.
 * Por isso o parser é estrito e fail-closed:
 * - exige `call_id` textual;
 * - aceita o URI em `sip_uri` OU `sip` (as duas grafias da documentação);
 *   se ambas existirem e divergirem, recusa;
 * - `session_id` só é usado se vier (necessário para encerrar e consultar);
 * - validade sempre `null` (desconhecida — nunca presumida válida).
 */
export interface MillisRegisterSipCallBody {
  readonly agent_id?: string;
  readonly agent_config: Readonly<Record<string, unknown>>;
  /** Minimização: apenas o identificador opaco de correlação (UUID). */
  readonly metadata: { readonly correlation_id: string };
  readonly include_metadata_in_prompt: false;
}

export interface MillisRegistration {
  readonly callId: string;
  readonly sessionId: string | null;
  readonly sipUri: string;
}

export type MillisRegistrationParse =
  | { readonly kind: 'REGISTERED'; readonly registration: MillisRegistration }
  /** Algo foi criado (ids legíveis) mas sem URI utilizável: precisa de limpeza. */
  | { readonly kind: 'UNUSABLE'; readonly sessionId: string | null }
  | { readonly kind: 'UNREADABLE' };

/** Mesmo conjunto estrito aceito pela TwiML do `<Sip>` (sem parâmetros nem cabeçalhos). */
export const MILLIS_SIP_URI_PATTERN = /^sip:[A-Za-z0-9._~!$&'()*+,=%-]+@[A-Za-z0-9.-]+(:\d{1,5})?$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function buildRegisterSipCallBody(
  correlationId: string,
  agent: { readonly agentId?: string; readonly agentConfig: Readonly<Record<string, unknown>> },
): MillisRegisterSipCallBody {
  return {
    ...(agent.agentId ? { agent_id: agent.agentId } : {}),
    agent_config: agent.agentConfig,
    metadata: { correlation_id: correlationId },
    include_metadata_in_prompt: false,
  };
}

function field(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)[key]
    : undefined;
}

function opaqueId(value: unknown): string | null {
  return typeof value === 'string' && OPAQUE_ID_PATTERN.test(value) ? value : null;
}

function sipUriFrom(body: unknown): string | null {
  const candidates = [field(body, 'sip_uri'), field(body, 'sip')].filter(
    (value) => value !== undefined && value !== null,
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 2 && candidates[0] !== candidates[1]) return null;
  const uri = candidates[0];
  return typeof uri === 'string' && uri.length < 200 && MILLIS_SIP_URI_PATTERN.test(uri)
    ? uri
    : null;
}

export function parseRegisterSipCallResponse(body: unknown): MillisRegistrationParse {
  const callId = opaqueId(field(body, 'call_id'));
  const sessionId = opaqueId(field(body, 'session_id'));
  if (!callId) return sessionId ? { kind: 'UNUSABLE', sessionId } : { kind: 'UNREADABLE' };
  const sipUri = sipUriFrom(body);
  if (!sipUri) return { kind: 'UNUSABLE', sessionId };
  return { kind: 'REGISTERED', registration: { callId, sessionId, sipUri } };
}

const REF_PREFIX = 'm1';

function encodePart(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Referência opaca da sessão para a plataforma: `m1.<call_id>.<session_id|vazio>`. */
export function encodeMillisSessionRef(registration: MillisRegistration): string | null {
  const ref = `${REF_PREFIX}.${encodePart(registration.callId)}.${
    registration.sessionId ? encodePart(registration.sessionId) : ''
  }`;
  return ref.length <= 128 ? ref : null;
}

export function decodeMillisSessionId(sessionRef: string): string | null {
  const [prefix, callPart, sessionPart, ...rest] = sessionRef.split('.');
  if (prefix !== REF_PREFIX || !callPart || rest.length > 0 || !sessionPart) return null;
  return opaqueId(Buffer.from(sessionPart, 'base64url').toString('utf8'));
}
