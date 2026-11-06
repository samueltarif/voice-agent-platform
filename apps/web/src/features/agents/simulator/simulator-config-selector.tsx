import * as React from 'react';
import Link from 'next/link';
import {
  SIMULATOR_CONFIG_QUERY_VALUES,
  SIMULATOR_CONFIGURATION_LABELS,
  type SimulatorConfigurationKind,
} from './select-simulator-configuration.js';

interface SimulatorConfigSelectorProps {
  readonly basePath: string;
  readonly available: readonly SimulatorConfigurationKind[];
  readonly selected: SimulatorConfigurationKind | null;
}

/** Links (navegáveis por teclado) entre as configurações salvas disponíveis. */
export function SimulatorConfigSelector({
  basePath,
  available,
  selected,
}: SimulatorConfigSelectorProps) {
  if (available.length === 0) return null;
  return (
    <nav aria-label="Configuração simulada" className="flex flex-wrap gap-2">
      {available.map((kind) => {
        const isCurrent = kind === selected;
        return (
          <Link
            key={kind}
            href={`${basePath}?config=${SIMULATOR_CONFIG_QUERY_VALUES[kind]}`}
            aria-current={isCurrent ? 'page' : undefined}
            data-testid={`simulator-config-${kind.toLowerCase()}`}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isCurrent
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {SIMULATOR_CONFIGURATION_LABELS[kind]}
          </Link>
        );
      })}
    </nav>
  );
}
