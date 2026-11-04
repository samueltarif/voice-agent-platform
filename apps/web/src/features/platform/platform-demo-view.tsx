'use client';

import * as React from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { PlatformShell } from './platform-shell';
import { MOCK_PLATFORM_OVERVIEW, MOCK_PLATFORM_TENANTS } from '../../mocks/platform-mock-data';
import { PlatformOverviewMetrics } from './platform-overview-metrics';
import { PlatformTenantsTable } from './platform-tenants-table';

/**
 * Prévia visual do painel da plataforma com DADOS FICTÍCIOS. Não executa
 * nenhuma ação administrativa; os botões de relatório ficam desativados.
 */
export function PlatformDemoView() {
  return (
    <PlatformShell>
      <div className="space-y-6">
        <div
          role="note"
          data-testid="platform-demo-banner"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <strong>Modo demonstração.</strong> Todos os números e organizações desta tela são
          fictícios. Não há acesso administrativo real: ele exigirá verificação de administrador da
          plataforma no servidor.
        </div>
        {/* Page Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Visão geral da plataforma
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Painel de controle centralizado para monitoramento de organizações, uso e consumo de
              infraestrutura.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 h-9 text-xs" disabled>
              <FileText className="h-3.5 w-3.5" />
              <span>Logs de auditoria</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2 h-9 text-xs" disabled>
              <Download className="h-3.5 w-3.5" />
              <span>Relatório de uso</span>
            </Button>
          </div>
        </div>

        {/* Platform Level Metric Cards */}
        <PlatformOverviewMetrics overview={MOCK_PLATFORM_OVERVIEW} />

        {/* Organizations Table */}
        <PlatformTenantsTable tenants={MOCK_PLATFORM_TENANTS} />
      </div>
    </PlatformShell>
  );
}
