import type { TenantRole } from '../tenant.js';
import type {
  AgentConfigurationSnapshotV1,
  AgentKnowledgeRetrievalProfile,
} from './agent-configuration-v1.js';

/**
 * B2a (DEC-071) — regras PURAS do perfil de busca da versão do agente.
 *
 * - Origem única: o snapshot carregado pelo servidor. Nunca pergunta,
 *   ferramenta, documento ou parâmetro do cliente.
 * - Ausente = `v1`. Caminhos `v1` NUNCA consultam as travas da `v2`.
 * - As travas (lista de organizações e chave de execução) são da PLATAFORMA,
 *   não do tenant: OWNER/ADMIN não as alteram por API.
 */
export function resolveKnowledgeRetrievalProfile(
  snapshot: Pick<AgentConfigurationSnapshotV1, 'knowledge'> | undefined,
): AgentKnowledgeRetrievalProfile {
  return snapshot?.knowledge?.retrievalProfile === 'v2' ? 'v2' : 'v1';
}

/** Travas da plataforma. Implementação real em `apps/api`; padrão FECHADO. */
export interface KnowledgeProfilePolicy {
  /** Organização na lista versionada de liberação (vazia em produção). */
  isOrganizationAllowed(organizationId: string): boolean;
  /** Chave global `KNOWLEDGE_V2_AGENT_RUNTIME` (só `enabled` liga). */
  isRuntimeEnabled(): boolean;
  /** Registro SEM conteúdo de recusas e indisponibilidades (log/métrica). */
  report?(event: KnowledgeProfileEvent): void;
}

export interface KnowledgeProfileEvent {
  readonly event: 'knowledge.profile_rejected' | 'knowledge.profile_unavailable';
  readonly action: 'DRAFT' | 'PUBLISH' | 'RUNTIME';
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId?: string | undefined;
  readonly reason: string;
}

/** Política que nega tudo: padrão de qualquer composição sem a política real. */
export const CLOSED_KNOWLEDGE_PROFILE_POLICY: KnowledgeProfilePolicy = Object.freeze({
  isOrganizationAllowed: () => false,
  isRuntimeEnabled: () => false,
});

export const KNOWLEDGE_PROFILE_ERROR_CODES = {
  /** Mesma resposta para qualquer motivo (não serve de oráculo). */
  NOT_AUTHORIZED: 'KNOWLEDGE_PROFILE_NOT_AUTHORIZED',
  UNAVAILABLE: 'KNOWLEDGE_PROFILE_UNAVAILABLE',
} as const;

export type KnowledgeProfileRejectionReason =
  'ORG_NOT_ALLOWED' | 'RUNTIME_OFF' | 'ROLE_NOT_ALLOWED';

const PROFILE_MANAGERS: ReadonlySet<TenantRole> = new Set(['OWNER', 'ADMIN']);

const sameKnowledge = (
  a: AgentConfigurationSnapshotV1['knowledge'],
  b: AgentConfigurationSnapshotV1['knowledge'],
) => a?.retrievalProfile === b?.retrievalProfile && (a === undefined) === (b === undefined);

/**
 * Gravação de rascunho. `previous` é a configuração PERSISTIDA (ou `undefined`
 * ao criar); `actorRole` vem do contexto autenticado no servidor. Manter o
 * campo como está é sempre permitido (o MANAGER edita os demais campos).
 */
export function evaluateKnowledgeProfileDraftWrite(input: {
  readonly organizationId: string;
  /** Papel do contexto AUTENTICADO; ausente = sem permissão para mudar o perfil. */
  readonly actorRole: TenantRole | undefined;
  readonly previous: Pick<AgentConfigurationSnapshotV1, 'knowledge'> | undefined;
  readonly next: Pick<AgentConfigurationSnapshotV1, 'knowledge'>;
  readonly policy: KnowledgeProfilePolicy;
}): KnowledgeProfileRejectionReason | null {
  if (sameKnowledge(input.previous?.knowledge, input.next.knowledge)) return null;
  if (!input.actorRole || !PROFILE_MANAGERS.has(input.actorRole)) return 'ROLE_NOT_ALLOWED';
  if (input.next.knowledge === undefined) return null;
  return input.policy.isOrganizationAllowed(input.organizationId) ? null : 'ORG_NOT_ALLOWED';
}

/**
 * Publicação. Snapshot sem o campo: nada é consultado (comportamento atual).
 * Campo presente exige organização liberada; `v2` exige também a chave ligada.
 */
export function evaluateKnowledgeProfilePublication(input: {
  readonly organizationId: string;
  readonly snapshot: Pick<AgentConfigurationSnapshotV1, 'knowledge'>;
  readonly policy: KnowledgeProfilePolicy;
}): KnowledgeProfileRejectionReason | null {
  if (input.snapshot.knowledge === undefined) return null;
  if (!input.policy.isOrganizationAllowed(input.organizationId)) return 'ORG_NOT_ALLOWED';
  if (resolveKnowledgeRetrievalProfile(input.snapshot) !== 'v2') return null;
  return input.policy.isRuntimeEnabled() ? null : 'RUNTIME_OFF';
}

/** Execução `v2`: as duas travas, sempre (só é chamada para versões `v2`). */
export function evaluateKnowledgeProfileRuntime(
  organizationId: string,
  policy: KnowledgeProfilePolicy,
): KnowledgeProfileRejectionReason | null {
  if (!policy.isRuntimeEnabled()) return 'RUNTIME_OFF';
  return policy.isOrganizationAllowed(organizationId) ? null : 'ORG_NOT_ALLOWED';
}
