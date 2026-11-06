import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';

/** Configuração mostrada pelo simulador: sempre uma versão já salva no servidor. */
export type SimulatorConfigurationKind = 'DRAFT' | 'PUBLISHED';

export const SIMULATOR_CONFIG_QUERY_VALUES: Readonly<Record<SimulatorConfigurationKind, string>> = {
  DRAFT: 'rascunho',
  PUBLISHED: 'publicada',
};

export interface SimulatorConfigurationSelection {
  readonly selected: {
    readonly kind: SimulatorConfigurationKind;
    readonly config: AgentConfigurationSnapshotV1;
  } | null;
  readonly available: readonly SimulatorConfigurationKind[];
}

/**
 * Prefere o rascunho salvo; a versão publicada só quando pedida
 * (`?config=publicada`) e já carregada pelo servidor. Valor desconhecido na
 * URL cai no padrão; nunca inventa configuração.
 */
export function selectSimulatorConfiguration(input: {
  readonly draftConfig: AgentConfigurationSnapshotV1 | null;
  readonly publishedConfig: AgentConfigurationSnapshotV1 | null;
  readonly requested?: string | string[] | undefined;
}): SimulatorConfigurationSelection {
  const available: SimulatorConfigurationKind[] = [];
  if (input.draftConfig) available.push('DRAFT');
  if (input.publishedConfig) available.push('PUBLISHED');
  const wantsPublished = input.requested === SIMULATOR_CONFIG_QUERY_VALUES.PUBLISHED;
  if (input.publishedConfig && (wantsPublished || !input.draftConfig)) {
    return { selected: { kind: 'PUBLISHED', config: input.publishedConfig }, available };
  }
  if (input.draftConfig) {
    return { selected: { kind: 'DRAFT', config: input.draftConfig }, available };
  }
  return { selected: null, available };
}

export const SIMULATOR_CONFIGURATION_LABELS: Readonly<Record<SimulatorConfigurationKind, string>> =
  {
    DRAFT: 'Rascunho salvo',
    PUBLISHED: 'Versão publicada',
  };
