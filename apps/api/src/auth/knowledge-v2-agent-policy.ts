import type { KnowledgeProfileEvent, KnowledgeProfilePolicy } from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';

/**
 * B2a (DEC-071) — travas da PLATAFORMA para a busca v2 em agentes.
 *
 * 1. LISTA DE ORGANIZAÇÕES: constante VERSIONADA no código e VAZIA. Incluir
 *    uma organização exige PR revisada, decisão (DEC) e autorização expressa
 *    do operador; nenhuma variável de ambiente, configuração ou API a altera.
 *    Um teste de guarda afirma que a lista está vazia.
 * 2. CHAVE DE EXECUÇÃO `KNOWLEDGE_V2_AGENT_RUNTIME`: só o valor EXATO
 *    `enabled` liga. É lida UMA VEZ na inicialização do processo: mudar a
 *    variável só vale depois de reiniciar/reimplantar TODAS as instâncias da
 *    API (conferir o log de partida `knowledge.v2_agent_runtime` em cada uma).
 *
 * As duas são necessárias para publicar e para executar `v2`. Nenhuma delas
 * cria versão `v2`: isso exige publicação explícita por OWNER/ADMIN.
 */
export const KNOWLEDGE_V2_AGENT_ORGANIZATIONS: readonly string[] = Object.freeze([]);

export const KNOWLEDGE_V2_AGENT_RUNTIME_ENV = 'KNOWLEDGE_V2_AGENT_RUNTIME';

export function readKnowledgeV2AgentRuntime(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env[KNOWLEDGE_V2_AGENT_RUNTIME_ENV] === 'enabled';
}

export interface KnowledgeV2AgentPolicyOptions {
  readonly runtimeEnabled: boolean;
  readonly organizations: readonly string[];
  readonly logger?: Logger | undefined;
}

/** Política real (com relatório SEM conteúdo: só ids, ação e motivo). */
export function createKnowledgeV2AgentPolicy(
  options: KnowledgeV2AgentPolicyOptions,
): KnowledgeProfilePolicy {
  const organizations = new Set(options.organizations);
  const runtimeEnabled = options.runtimeEnabled;
  return Object.freeze({
    isOrganizationAllowed: (organizationId: string) => organizations.has(organizationId),
    isRuntimeEnabled: () => runtimeEnabled,
    report: (event: KnowledgeProfileEvent) => options.logger?.warn(event.event, { ...event }),
  });
}

/** Composição de produção: lista versionada + chave lida agora (inicialização). */
export function createProductionKnowledgeV2AgentPolicy(
  env: Readonly<Record<string, string | undefined>>,
  logger: Logger,
): KnowledgeProfilePolicy {
  const runtimeEnabled = readKnowledgeV2AgentRuntime(env);
  logger.info('knowledge.v2_agent_runtime', {
    knowledgeV2AgentRuntime: runtimeEnabled ? 'on' : 'off',
    knowledgeV2AgentOrganizations: KNOWLEDGE_V2_AGENT_ORGANIZATIONS.length,
  });
  return createKnowledgeV2AgentPolicy({
    runtimeEnabled,
    organizations: KNOWLEDGE_V2_AGENT_ORGANIZATIONS,
    logger,
  });
}
