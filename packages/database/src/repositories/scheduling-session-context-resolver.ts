import { and, eq } from 'drizzle-orm';
import {
  schedulingCapabilityFor,
  type SchedulingContextRefusal,
  type SchedulingSessionBinding,
  type SchedulingSessionContext,
  type SchedulingSessionContextPort,
  type SchedulingSessionContextQuery,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { callAttempts, type CallAttemptEntity } from '../schema/call-attempts.js';
import { callSessions, type CallSessionEntity } from '../schema/call-sessions.js';
import { contacts } from '../schema/contacts.js';
import { leads } from '../schema/leads.js';
import { outboundCallJobs } from '../schema/outbound.js';
import type { DatabaseExecutor } from './database-executor.js';
import { pinnedCalendarResolution } from './scheduling-session-context-pin.js';

/**
 * E2 PR 1 (DEC-075) — contexto de agendamento de uma sessão, resolvido SÓ no
 * servidor pelo vínculo durável EXISTENTE sessão ↔ tentativa (as duas pontas
 * precisam apontar uma para a outra, no mesmo tenant). A consulta vem de uma
 * concessão legítima (`callId` = `call_sessions.id`); nenhum id vem do modelo.
 *
 * Não escreve nada além da fixação da agenda e não trava linhas: é leitura
 * de contexto, não efeito comercial. Os efeitos (PR 2/3) revalidam sob trava.
 */

/** Estados de tentativa em que uma chamada pode ter existido (inclui encerrada). */
const CALL_BEARING_ATTEMPT_STATES = new Set([
  'ORIGINATION_SENT',
  'ORIGINATION_ACCEPTED',
  'OUTCOME_UNKNOWN',
  'RECONCILIATION_PENDING',
  'CLOSED',
]);

type Refused = { readonly kind: 'REFUSED'; readonly reason: SchedulingContextRefusal };
const refuse = (reason: SchedulingContextRefusal): Refused => ({ kind: 'REFUSED', reason });

function sessionRefusal(
  session: CallSessionEntity | undefined,
  query: SchedulingSessionContextQuery,
): SchedulingContextRefusal | null {
  if (!session) return 'SESSION_NOT_FOUND';
  if (session.agentId !== query.agentId) return 'AGENT_MISMATCH';
  if (session.agentVersionId !== query.agentVersionId) return 'AGENT_VERSION_MISMATCH';
  return session.currentAttemptId ? null : 'ATTEMPT_NOT_BOUND';
}

function attemptRefusal(
  attempt: CallAttemptEntity | undefined,
  session: CallSessionEntity,
): SchedulingContextRefusal | null {
  if (!attempt || attempt.callSessionId !== session.id) return 'ATTEMPT_NOT_BOUND';
  if (attempt.agentVersionId !== session.agentVersionId) return 'AGENT_VERSION_MISMATCH';
  return CALL_BEARING_ATTEMPT_STATES.has(attempt.state) ? null : 'ATTEMPT_STATE_INCOMPATIBLE';
}

async function leadForDestination(
  executor: DatabaseExecutor,
  organizationId: string,
  phoneE164: string,
): Promise<string | null> {
  const [row] = await executor
    .select({ leadId: leads.id })
    .from(contacts)
    .innerJoin(
      leads,
      and(eq(leads.contactId, contacts.id), eq(leads.organizationId, contacts.organizationId)),
    )
    .where(and(eq(contacts.organizationId, organizationId), eq(contacts.phoneE164, phoneE164)));
  return row?.leadId ?? null;
}

export class DrizzleSchedulingSessionContextResolver implements SchedulingSessionContextPort {
  constructor(private readonly db: DatabaseInstance) {}

  async resolve(query: SchedulingSessionContextQuery): Promise<SchedulingSessionContext> {
    const [session] = await this.db
      .select()
      .from(callSessions)
      .where(
        and(
          eq(callSessions.id, query.sessionId),
          eq(callSessions.organizationId, query.organizationId),
        ),
      );
    const refusedSession = sessionRefusal(session, query);
    if (refusedSession) return refuse(refusedSession);
    const [attempt] = await this.db
      .select()
      .from(callAttempts)
      .where(
        and(
          eq(callAttempts.id, session!.currentAttemptId!),
          eq(callAttempts.organizationId, query.organizationId),
        ),
      );
    const refusedAttempt = attemptRefusal(attempt, session!);
    if (refusedAttempt) return refuse(refusedAttempt);
    return this.bound(session!, attempt!);
  }

  private async bound(
    session: CallSessionEntity,
    attempt: CallAttemptEntity,
  ): Promise<SchedulingSessionContext> {
    const [job] = await this.db
      .select({ destination: outboundCallJobs.destinationPhone })
      .from(outboundCallJobs)
      .where(
        and(
          eq(outboundCallJobs.id, attempt.jobId),
          eq(outboundCallJobs.organizationId, attempt.organizationId),
        ),
      );
    if (!job) return refuse('ATTEMPT_NOT_BOUND');
    const binding: SchedulingSessionBinding = {
      organizationId: session.organizationId,
      sessionId: session.id,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      campaignId: attempt.campaignId,
      agentId: session.agentId,
      agentVersionId: session.agentVersionId,
      destinationPhoneE164: job.destination,
    };
    const calendar = await pinnedCalendarResolution(this.db, binding);
    const leadId = await leadForDestination(
      this.db,
      binding.organizationId,
      binding.destinationPhoneE164,
    );
    const sessionActive = session.runtimeState === 'ACTIVE' && attempt.state !== 'CLOSED';
    return {
      kind: 'BOUND',
      binding,
      optOut: { available: true },
      scheduling: schedulingCapabilityFor({ sessionActive, leadId, calendar }),
      calendar,
    };
  }
}
