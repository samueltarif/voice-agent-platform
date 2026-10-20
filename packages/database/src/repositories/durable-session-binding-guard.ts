import { and, eq } from 'drizzle-orm';
import {
  canBindSession,
  type OutboundAttemptEvent,
  type OutboundAttemptRejectionReason,
} from '@voice-agent/contracts';
import { callSessions } from '../schema/call-sessions.js';
import type { CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';

/**
 * Antes de a FSM vincular `callSessionId` a uma tentativa ainda sem sessão,
 * trava a sessão (FOR UPDATE) e exige que ela exista no MESMO tenant e aponte
 * de volta para ESTA tentativa. Referências opacas divergentes entre sessão e
 * aceite são conflito (sem presumir autenticidade de nenhuma das duas).
 * A FK composta `call_attempts_session_binding_fk` é a defesa final no banco.
 */
function bindingCandidate(row: CallAttemptEntity, event: OutboundAttemptEvent): string | null {
  const sessionId = event.callSessionId ?? null;
  return sessionId && row.callSessionId === null && canBindSession(event) ? sessionId : null;
}

export async function checkSessionBinding(
  executor: DatabaseExecutor,
  ctx: { readonly row: CallAttemptEntity; readonly event: OutboundAttemptEvent },
): Promise<OutboundAttemptRejectionReason | null> {
  const { row, event } = ctx;
  const sessionId = bindingCandidate(row, event);
  if (!sessionId) return null;
  const [session] = await executor
    .select({
      currentAttemptId: callSessions.currentAttemptId,
      providerCallReference: callSessions.providerCallReference,
    })
    .from(callSessions)
    .where(and(eq(callSessions.id, sessionId), eq(callSessions.organizationId, row.organizationId)))
    .for('update');
  if (!session || session.currentAttemptId !== row.id) return 'SESSION_MISMATCH';
  return referencesConflict(session.providerCallReference, event)
    ? 'PROVIDER_REFERENCE_CONFLICT'
    : null;
}

function referencesConflict(known: string | null, event: OutboundAttemptEvent): boolean {
  const incoming = 'providerReference' in event ? event.providerReference : undefined;
  return Boolean(known && incoming && known !== incoming);
}
