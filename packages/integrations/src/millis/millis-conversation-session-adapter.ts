import type {
  ConversationSessionPort,
  ConversationSessionPreparation,
  ConversationSessionPreparationRequest,
  ConversationSessionRef,
  ConversationSessionStatus,
  ConversationSessionTermination,
} from '@voice-agent/contracts';
import type { MillisConfig } from './millis-config.js';
import type { MillisHttpResponse, MillisHttpTransport } from './millis-http-transport.js';
import {
  buildRegisterSipCallBody,
  decodeMillisSessionId,
  encodeMillisSessionRef,
  parseRegisterSipCallResponse,
} from './millis-register-sip-call.js';

/**
 * 008-OF5 (S3) — `ConversationSessionPort` sobre a Millis AI, só com operações
 * documentadas: `POST /register_sip_call`, `POST /sessions/{session_id}/terminate`
 * e `GET /call-logs/{session_id}`. A Millis NUNCA origina chamada aqui
 * (autoridade única = telefonia). Telefones e dados do contato não são enviados.
 */
export interface MillisPublishedAgent {
  /** Agente cadastrado na Millis (opcional; documentado como opcional). */
  readonly agentId?: string;
  /** `agent_config` gerado no servidor a partir do snapshot publicado (008-MVP3). */
  readonly agentConfig: Readonly<Record<string, unknown>>;
}

export interface MillisSessionAdapterDependencies {
  readonly config: MillisConfig;
  readonly transport: MillisHttpTransport;
  /** Snapshot da versão PUBLICADA da organização; `null` = não autorizado. */
  readonly resolvePublishedAgent: (
    request: ConversationSessionPreparationRequest,
  ) => Promise<MillisPublishedAgent | null>;
  /** Auditoria de sessão possivelmente órfã (sem dados pessoais). */
  readonly reportOrphanRisk?: (detail: { readonly reason: string }) => void;
}

/** Enum `CallStatus` do OpenAPI (20 valores) → status neutro. */
const ACTIVE = new Set(['registered', 'queued', 'dispatching', 'provider_queued', 'initiated']);
const LIVE = new Set(['ringing', 'in-progress']);
const ENDED = new Set([
  'user-ended',
  'agent-ended',
  'api-ended',
  'voicemail-hangup',
  'voicemail-message',
  'timeout',
  'canceled',
  'busy',
  'no-answer',
  'failed',
  'error',
]);

export function mapMillisCallStatus(value: unknown): ConversationSessionStatus {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (ACTIVE.has(value) || LIVE.has(value)) return 'ACTIVE';
  return ENDED.has(value) ? 'ENDED' : 'UNKNOWN';
}

function unavailableFor(response: MillisHttpResponse): ConversationSessionPreparation {
  if (response.kind === 'NO_RESPONSE') {
    return {
      kind: 'UNAVAILABLE',
      reason: response.cause === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_DOWN',
    };
  }
  return {
    kind: 'UNAVAILABLE',
    reason: response.status >= 500 || response.status === 429 ? 'PROVIDER_DOWN' : 'REJECTED',
  };
}

export class MillisConversationSessionAdapter implements ConversationSessionPort {
  constructor(private readonly deps: MillisSessionAdapterDependencies) {}

  async prepare(
    request: ConversationSessionPreparationRequest,
  ): Promise<ConversationSessionPreparation> {
    if (!this.deps.config.enabled) return { kind: 'UNAVAILABLE', reason: 'REJECTED' };
    const agent = await this.deps.resolvePublishedAgent(request);
    if (!agent) return { kind: 'UNAVAILABLE', reason: 'REJECTED' };
    const body = buildRegisterSipCallBody(request.correlationId, agent);
    let response: MillisHttpResponse;
    try {
      response = await this.deps.transport.send({
        method: 'POST',
        path: '/register_sip_call',
        body,
      });
    } catch {
      return { kind: 'UNAVAILABLE', reason: 'PROVIDER_DOWN' };
    }
    if (response.kind !== 'HTTP' || response.status !== 200) return this.unavailable(response);
    return this.fromRegistration(response.body);
  }

  async terminate(ref: ConversationSessionRef): Promise<ConversationSessionTermination> {
    const sessionId = decodeMillisSessionId(ref.sessionRef);
    if (!this.deps.config.enabled || !sessionId) return 'UNKNOWN';
    const response = await this.safeSend(`/sessions/${sessionId}/terminate`, 'POST');
    if (response?.kind !== 'HTTP') return 'UNKNOWN';
    if (response.status === 404) return 'NOT_FOUND';
    return response.status === 200 ? 'TERMINATED' : 'UNKNOWN';
  }

  async getStatus(ref: ConversationSessionRef): Promise<ConversationSessionStatus> {
    const sessionId = decodeMillisSessionId(ref.sessionRef);
    if (!this.deps.config.enabled || !sessionId) return 'UNKNOWN';
    const response = await this.safeSend(`/call-logs/${sessionId}`, 'GET');
    if (response?.kind !== 'HTTP') return 'UNKNOWN';
    if (response.status === 404) return 'NOT_FOUND';
    const body = response.body as Record<string, unknown> | null;
    return response.status === 200 ? mapMillisCallStatus(body?.['call_status']) : 'UNKNOWN';
  }

  private unavailable(response: MillisHttpResponse): ConversationSessionPreparation {
    if (response.kind === 'NO_RESPONSE') this.deps.reportOrphanRisk?.({ reason: 'NO_RESPONSE' });
    return unavailableFor(response);
  }

  private async fromRegistration(body: unknown): Promise<ConversationSessionPreparation> {
    const parsed = parseRegisterSipCallResponse(body);
    const sessionRef =
      parsed.kind === 'REGISTERED' ? encodeMillisSessionRef(parsed.registration) : null;
    if (parsed.kind === 'REGISTERED' && sessionRef) {
      const mediaTarget = { kind: 'SIP_URI' as const, uri: parsed.registration.sipUri };
      return { kind: 'PREPARED', sessionRef, mediaTarget, expiresAt: null };
    }
    const sessionId =
      parsed.kind === 'UNREADABLE'
        ? null
        : parsed.kind === 'UNUSABLE'
          ? parsed.sessionId
          : parsed.registration.sessionId;
    if (sessionId) await this.safeSend(`/sessions/${sessionId}/terminate`, 'POST');
    else this.deps.reportOrphanRisk?.({ reason: 'UNREADABLE_REGISTRATION' });
    return { kind: 'UNAVAILABLE', reason: 'REJECTED' };
  }

  private async safeSend(path: string, method: 'GET' | 'POST'): Promise<MillisHttpResponse | null> {
    try {
      return await this.deps.transport.send({ method, path });
    } catch {
      return null;
    }
  }
}
