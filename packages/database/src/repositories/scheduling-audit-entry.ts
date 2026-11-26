import type { SchedulingActorType } from '@voice-agent/contracts';
import { auditLogs } from '../schema/audit.js';
import type { DatabaseExecutor } from './database-executor.js';

/** E1 (DEC-074) — quem executa uma operação de leads/agenda. */
export interface SchedulingActor {
  readonly type: SchedulingActorType;
  readonly id: string;
}

export interface SchedulingAuditEntry {
  readonly organizationId: string;
  readonly actor: SchedulingActor;
  readonly action: string;
  readonly targetType: 'lead' | 'scheduling_calendar' | 'meeting';
  readonly targetId: string;
  /** Só identificadores e valores de negócio; nunca telefone, nome ou texto livre do lead. */
  readonly metadata?: Readonly<Record<string, string | number | null>>;
}

/** Trilha de auditoria gravada NA MESMA transação da mudança auditada. */
export async function insertSchedulingAudit(
  executor: DatabaseExecutor,
  entry: SchedulingAuditEntry,
): Promise<void> {
  await executor.insert(auditLogs).values({
    organizationId: entry.organizationId,
    actorId: entry.actor.id,
    actorType: entry.actor.type,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
  });
}
