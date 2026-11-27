import { and, eq, ne, sql } from 'drizzle-orm';
import { outboundCallJobs } from '../schema/outbound.js';
import type { CallAttemptEntity } from '../schema/call-attempts.js';
import {
  postCallReconciliations,
  type PostCallReconciliationEntity,
} from '../schema/post-call-reconciliations.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { SchedulingBinding } from './scheduling-protocol-store.js';

/**
 * E2 simplificada (DEC-077) — linha de reconciliação pós-chamada (trava R).
 * Criada na primeira ferramenta da sessão (ou pela composição ao iniciar a
 * chamada) e mantida aberta até o relatório ser reconciliado ou um humano
 * decidir. Enquanto aberta, o claim de envio recusa novas tentativas para o
 * mesmo telefone.
 */

export interface ReconciliationKey {
  readonly organizationId: string;
  readonly sessionId: string;
}

const byKey = (key: ReconciliationKey) =>
  and(
    eq(postCallReconciliations.organizationId, key.organizationId),
    eq(postCallReconciliations.sessionId, key.sessionId),
  );

/** Idempotente: nunca reabre nem altera uma linha existente. */
export async function ensureReconciliation(
  tx: DatabaseExecutor,
  binding: Pick<SchedulingBinding, 'organizationId' | 'sessionId' | 'attemptId'>,
  input: { readonly phoneE164: string; readonly leadId: string | null; readonly now: Date },
): Promise<void> {
  await tx
    .insert(postCallReconciliations)
    .values({
      organizationId: binding.organizationId,
      sessionId: binding.sessionId,
      attemptId: binding.attemptId,
      leadId: input.leadId,
      phoneE164: input.phoneE164,
      // Relógio da aplicação (o mesmo do prazo de relatório ausente).
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing();
}

export async function lockReconciliation(
  tx: DatabaseExecutor,
  key: ReconciliationKey,
): Promise<PostCallReconciliationEntity | null> {
  const [row] = await tx.select().from(postCallReconciliations).where(byKey(key)).for('update');
  return row ?? null;
}

/**
 * A4 — o relatório `digest` ainda é o vigente desta reconciliação? (trava R;
 * chamar DEPOIS de I). Falso quando outro relatório entrou em conflito, um
 * humano já decidiu ou a reconciliação já fechou: nenhum efeito comercial.
 */
export async function lockCurrentReport(
  tx: DatabaseExecutor,
  key: ReconciliationKey,
  digest: string,
): Promise<PostCallReconciliationEntity | null> {
  const row = await lockReconciliation(tx, key);
  const current =
    row?.reportDigest === digest &&
    row.status !== 'RECONCILED' &&
    !row.reviewReasons.includes('REPORT_CONFLICT');
  return current ? row : null;
}

/** A6 — relatório final já registrado: a sessão não aceita novas operações comerciais. */
export async function isSessionSealed(
  executor: DatabaseExecutor,
  key: ReconciliationKey,
): Promise<boolean> {
  const [row] = await executor
    .select({ digest: postCallReconciliations.reportDigest })
    .from(postCallReconciliations)
    .where(byKey(key));
  return Boolean(row?.digest);
}

export async function updateReconciliation(
  tx: DatabaseExecutor,
  key: ReconciliationKey,
  changes: Partial<Omit<PostCallReconciliationEntity, 'organizationId' | 'sessionId'>>,
): Promise<void> {
  await tx
    .update(postCallReconciliations)
    .set({
      ...changes,
      version: sql`${postCallReconciliations.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(byKey(key));
}

/** Barreira do claim de envio: há reconciliação em aberto para o destino desta tentativa? */
export async function isDestinationAwaitingReconciliation(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
): Promise<boolean> {
  const [hit] = await executor
    .select({ hit: sql<number>`1` })
    .from(postCallReconciliations)
    .innerJoin(
      outboundCallJobs,
      and(
        eq(outboundCallJobs.id, row.jobId),
        eq(outboundCallJobs.organizationId, row.organizationId),
        eq(outboundCallJobs.destinationPhone, postCallReconciliations.phoneE164),
      ),
    )
    .where(
      and(
        eq(postCallReconciliations.organizationId, row.organizationId),
        ne(postCallReconciliations.status, 'RECONCILED'),
      ),
    )
    .limit(1);
  return hit !== undefined;
}
