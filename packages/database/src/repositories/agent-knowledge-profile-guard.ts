import {
  evaluateKnowledgeProfileDraftWrite,
  evaluateKnowledgeProfilePublication,
  KNOWLEDGE_PROFILE_ERROR_CODES,
  resolveKnowledgeRetrievalProfile,
  type AgentConfigurationSnapshotV1,
  type KnowledgeProfilePolicy,
  type KnowledgeProfileRejectionReason,
  type TenantRole,
} from '@voice-agent/contracts';
import { AppError } from '@voice-agent/errors';

/**
 * B2a (DEC-071): aplica as regras puras do perfil de busca nas gravações de
 * rascunho e na publicação. Resposta igual para qualquer motivo (403, sem
 * oráculo); o motivo vai só para o relatório sem conteúdo da política.
 */
interface GuardTarget {
  readonly organizationId: string;
  readonly agentId: string;
  readonly versionId?: string | undefined;
}

function reject(
  policy: KnowledgeProfilePolicy,
  rejection: {
    readonly target: GuardTarget;
    readonly action: 'DRAFT' | 'PUBLISH';
    readonly reason: KnowledgeProfileRejectionReason;
  },
): never {
  const { target, action, reason } = rejection;
  policy.report?.({
    event: 'knowledge.profile_rejected',
    action,
    organizationId: target.organizationId,
    agentId: target.agentId,
    agentVersionId: target.versionId,
    reason,
  });
  throw new AppError(
    'Knowledge retrieval profile change is not authorized',
    403,
    KNOWLEDGE_PROFILE_ERROR_CODES.NOT_AUTHORIZED,
  );
}

export function assertKnowledgeProfileDraftWrite(
  policy: KnowledgeProfilePolicy,
  target: GuardTarget & { readonly actorRole?: TenantRole | undefined },
  change: {
    readonly previous: Pick<AgentConfigurationSnapshotV1, 'knowledge'> | undefined;
    readonly next: AgentConfigurationSnapshotV1;
  },
): void {
  const reason = evaluateKnowledgeProfileDraftWrite({
    organizationId: target.organizationId,
    actorRole: target.actorRole,
    previous: change.previous,
    next: change.next,
    policy,
  });
  if (reason) reject(policy, { target, action: 'DRAFT', reason });
}

/** Devolve o perfil efetivo da versão publicada (para a auditoria). */
export function assertKnowledgeProfilePublication(
  policy: KnowledgeProfilePolicy,
  target: GuardTarget,
  snapshot: AgentConfigurationSnapshotV1,
): 'v1' | 'v2' {
  const reason = evaluateKnowledgeProfilePublication({
    organizationId: target.organizationId,
    snapshot,
    policy,
  });
  if (reason) reject(policy, { target, action: 'PUBLISH', reason });
  return resolveKnowledgeRetrievalProfile(snapshot);
}
