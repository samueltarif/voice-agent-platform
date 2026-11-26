import type {
  SchedulingSessionContext,
  SchedulingSessionContextPort,
} from '@voice-agent/contracts';
import { isIssuedPublishedToolGrant } from './published-tool-grant.js';

export const SCHEDULING_GRANT_REQUIRED_MESSAGE =
  'Scheduling context requires a tool grant issued by the CallLifecycleGateway.';

/**
 * E2 PR 1 (DEC-075) — ÚNICA porta de entrada do contexto de agendamento no
 * runtime de voz. A identidade (tenant, sessão = `callId`, agente e versão)
 * vem SÓ de uma `PublishedToolGrant` emitida pelo gateway (registro privado
 * `WeakSet`); cópia, JSON ou objeto com o mesmo formato lança erro
 * (fail-closed). Uma concessão legítima NÃO prova sessão ativa (ajuste A3):
 * isso é decidido no servidor pelo vínculo durável sessão ↔ tentativa.
 *
 * Coerência da versão fixada: se a agenda vier da versão publicada, ela tem
 * de ser a mesma do snapshot congelado na concessão; divergência recusa.
 * Nada aqui está registrado em composição de produção (PR 1 sem efeitos).
 */
export async function resolveSchedulingContextForGrant(
  grant: unknown,
  port: SchedulingSessionContextPort,
): Promise<SchedulingSessionContext> {
  if (!isIssuedPublishedToolGrant(grant)) throw new Error(SCHEDULING_GRANT_REQUIRED_MESSAGE);
  const context = await port.resolve({
    organizationId: grant.organizationId,
    sessionId: grant.callId,
    agentId: grant.agentId,
    agentVersionId: grant.agentVersionId,
  });
  if (context.kind !== 'BOUND' || context.calendar.kind !== 'RESOLVED') return context;
  const fromSnapshot = grant.snapshot.scheduling?.calendarId ?? null;
  const pinned = context.calendar;
  if (pinned.source === 'AGENT_VERSION' && pinned.calendarId !== fromSnapshot) {
    return { kind: 'REFUSED', reason: 'AGENT_VERSION_MISMATCH' };
  }
  return context;
}
