import type { AgentConfigurationSnapshotV1, CanonicalToolName } from './agent-configuration-v1.js';

/**
 * Regra pura de CONFIGURAÇÃO (movida de `apps/voice`, decisão S1/DEC-050):
 * lista as ferramentas declaradas num snapshot de configuração de agente.
 *
 * Não é autorização de execução. Na chamada real, executar exige também a
 * concessão emitida pelo servidor (organização, versão, chamada e identidade
 * do snapshot), que existe só em `apps/voice`. Para um rascunho, o resultado
 * significa "configurada no rascunho", nunca "permitida".
 */
export function resolvePublishedVersionToolset(
  snapshot?: AgentConfigurationSnapshotV1 | undefined,
): readonly CanonicalToolName[] {
  if (!snapshot || !Array.isArray(snapshot.tools)) {
    return [];
  }
  return snapshot.tools;
}

/** Indica se a ferramenta está declarada no snapshot (mesma ressalva acima). */
export function isToolConfiguredInSnapshot(
  toolName: string,
  snapshot?: AgentConfigurationSnapshotV1 | undefined,
): boolean {
  const toolset = resolvePublishedVersionToolset(snapshot);
  return toolset.includes(toolName as CanonicalToolName);
}
