import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { contactSuppressions, contacts } from '../schema/contacts.js';
import { leads, type LeadEntity } from '../schema/leads.js';
import type { DatabaseExecutor } from './database-executor.js';
import { recordLeadOptOut } from './lead-opt-out.js';
import type { SchedulingActor } from './scheduling-audit-entry.js';
import { reserveSeq, type LockedProtocol } from './scheduling-protocol-store.js';
import { lockSuppressionKey } from './suppression-linearization-lock.js';

/**
 * E2 PR 3 (DEC-075, D2) — opt-out CANÔNICO gravado pelo servidor, na MESMA
 * transação do evento que o reconheceu. Ordem: L (lead, travado antes pelo
 * chamador) → A → S (protocolo) → P (telefone, aqui, sempre por último).
 * - Com lead: `recordLeadOptOut` da E1 (supressão SEMPRE; `DO_NOT_CALL`, ou
 *   reunião ativa preservada).
 * - Sem lead para o destino: supressão canônica do telefone mesmo assim.
 * A supressão nunca é removida; nada aqui depende do modelo nem do toolset.
 */

export type OptOutSource = 'LEAD_UTTERANCE' | 'CLARIFICATION' | 'AGENT_TOOL';

/** Lead do destino discado (contato com o mesmo telefone no tenant), sem trava. */
export async function leadIdForPhone(
  db: DatabaseInstance,
  scope: { readonly organizationId: string; readonly phoneE164: string },
): Promise<string | null> {
  const [row] = await db
    .select({ leadId: leads.id })
    .from(contacts)
    .innerJoin(
      leads,
      and(eq(leads.contactId, contacts.id), eq(leads.organizationId, contacts.organizationId)),
    )
    .where(
      and(
        eq(contacts.organizationId, scope.organizationId),
        eq(contacts.phoneE164, scope.phoneE164),
      ),
    );
  return row?.leadId ?? null;
}

async function suppressPhoneOnly(
  tx: DatabaseExecutor,
  input: {
    readonly organizationId: string;
    readonly phoneE164: string;
    readonly sessionId: string;
  },
) {
  await lockSuppressionKey(tx, input.organizationId, input.phoneE164);
  await tx
    .insert(contactSuppressions)
    .values({
      organizationId: input.organizationId,
      phoneE164: input.phoneE164,
      reason: 'OPT_OUT',
      evidenceReference: `call-session:${input.sessionId}`,
    })
    .onConflictDoNothing({
      target: [contactSuppressions.organizationId, contactSuppressions.phoneE164],
    });
}

export interface CanonicalOptOutInput {
  readonly lead: LeadEntity | null;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly phoneE164: string;
  readonly actor: SchedulingActor;
  readonly source: OptOutSource;
  readonly now: Date;
}

/** Grava a supressão (P) e marca a sessão; devolve se uma reunião ativa foi preservada. */
export async function recordCanonicalOptOut(
  tx: DatabaseExecutor,
  locked: LockedProtocol,
  input: CanonicalOptOutInput,
): Promise<{ readonly meetingPreserved: boolean; readonly locked: LockedProtocol }> {
  let meetingPreserved = false;
  if (input.lead) {
    const result = await recordLeadOptOut(tx, { lead: input.lead, actor: input.actor });
    meetingPreserved = result.kind === 'OPTED_OUT_MEETING_PRESERVED';
  } else {
    await suppressPhoneOnly(tx, input);
  }
  const marked = await reserveSeq(tx, locked, {
    optOutPending: false,
    optOutQuestionGeneration: null,
    optOutQuestionDeliveredSeq: null,
    optOutRecordedAt: input.now,
    optOutSource: input.source,
  });
  return { meetingPreserved, locked: marked };
}
