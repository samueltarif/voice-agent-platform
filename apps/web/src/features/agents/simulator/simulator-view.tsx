import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { SimulatorConfigSelector } from './simulator-config-selector.js';
import { SimulatorContextCard } from './simulator-context-card.js';
import { SimulatorOfflineBanner } from './simulator-offline-banner.js';
import { SimulatorToolsCard } from './simulator-tools-card.js';
import {
  SIMULATOR_CONFIGURATION_LABELS,
  type SimulatorConfigurationSelection,
} from './select-simulator-configuration.js';

export interface SimulatorViewProps {
  readonly organizationName: string;
  readonly orgSlug: string;
  readonly agentId: string;
  readonly agentName: string | null;
  readonly selection: SimulatorConfigurationSelection | null;
  /** Mensagem sem dados de configuração (sem permissão, não encontrado, erro). */
  readonly notice: string | null;
}

function SimulatorNotice({ text }: { readonly text: string }) {
  return (
    <p
      role="status"
      data-testid="simulator-notice"
      className="rounded-lg border border-border/60 p-4 text-xs text-muted-foreground"
    >
      {text}
    </p>
  );
}

function SimulatorHeader(props: SimulatorViewProps) {
  const selected = props.selection?.selected ?? null;
  const parts = [`Organização: ${props.organizationName}`];
  if (props.agentName) parts.push(`Agente: ${props.agentName}`);
  if (selected) parts.push(`Configuração: ${SIMULATOR_CONFIGURATION_LABELS[selected.kind]}`);
  return (
    <header className="space-y-1">
      <h1 className="text-xl font-bold tracking-tight text-foreground">Simulador</h1>
      <p className="text-xs text-muted-foreground" data-testid="simulator-identity">
        {parts.join(' · ')}
      </p>
    </header>
  );
}

function SimulatorBody({
  selection,
  basePath,
}: {
  readonly selection: SimulatorConfigurationSelection;
  readonly basePath: string;
}) {
  const selected = selection.selected;
  return (
    <>
      <SimulatorConfigSelector
        basePath={basePath}
        available={selection.available}
        selected={selected?.kind ?? null}
      />
      {selected ? (
        <div className="grid grid-cols-1 gap-4">
          <SimulatorContextCard config={selected.config} />
          <SimulatorToolsCard config={selected.config} kind={selected.kind} />
        </div>
      ) : (
        <SimulatorNotice text="Este agente ainda não tem rascunho salvo nem versão publicada para simular." />
      )}
    </>
  );
}

/** Página só de leitura, montada no servidor; nenhum dado é salvo ou executado. */
export function SimulatorView(props: SimulatorViewProps) {
  const detailPath = `/orgs/${props.orgSlug}/agents/${props.agentId}`;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <SimulatorOfflineBanner />
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 gap-2 text-xs text-muted-foreground"
      >
        <Link href={detailPath} data-testid="simulator-back-link">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Voltar para o agente</span>
        </Link>
      </Button>
      <SimulatorHeader {...props} />
      {props.notice && <SimulatorNotice text={props.notice} />}
      {!props.notice && props.selection && (
        <SimulatorBody selection={props.selection} basePath={`${detailPath}/simulador`} />
      )}
    </div>
  );
}
