import * as React from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import {
  isToolConfiguredInSnapshot,
  type AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { AVAILABLE_CANONICAL_TOOLS } from '../agent-tool-catalog.js';
import type { SimulatorConfigurationKind } from './select-simulator-configuration.js';

const CONFIGURED_LABEL: Readonly<Record<SimulatorConfigurationKind, string>> = {
  DRAFT: 'Configurada no rascunho',
  PUBLISHED: 'Configurada na versão publicada',
};

interface SimulatorToolsCardProps {
  readonly config: AgentConfigurationSnapshotV1;
  readonly kind: SimulatorConfigurationKind;
}

/**
 * Mostra só o ESTADO DA CONFIGURAÇÃO (regra pura de `packages/contracts`).
 * Estar configurada não autoriza execução: isso exige concessão do servidor.
 */
export function SimulatorToolsCard({ config, kind }: SimulatorToolsCardProps) {
  return (
    <Card role="region" aria-labelledby="simulator-tools-title" data-testid="simulator-tools-card">
      <CardHeader className="space-y-1">
        <CardTitle id="simulator-tools-title" className="text-base">
          Ferramentas
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Regra determinística — não é resposta de IA. Nenhuma ferramenta é executada aqui.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {AVAILABLE_CANONICAL_TOOLS.map((tool) => {
            const configured = isToolConfiguredInSnapshot(tool.name, config);
            return (
              <li
                key={tool.name}
                data-testid={`simulator-tool-${tool.name}`}
                className="flex flex-col gap-1 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{tool.label}</p>
                  <code className="break-all text-[11px] text-muted-foreground">{tool.name}</code>
                </div>
                <Badge variant={configured ? 'default' : 'outline'} className="w-fit shrink-0">
                  {configured ? CONFIGURED_LABEL[kind] : 'Não configurada'}
                </Badge>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground" data-testid="simulator-tools-grant-note">
          Configurar uma ferramenta não basta para executá-la. Numa chamada real, a execução só
          acontece com uma concessão confiável emitida pelo servidor para esta organização, a versão
          publicada e a chamada em curso.
        </p>
      </CardContent>
    </Card>
  );
}
