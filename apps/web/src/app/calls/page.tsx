'use client';

import * as React from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { TenantShell } from '../../shell/tenant-shell';
import { MOCK_DETAILED_CALL } from '../../mocks/calls-mock-data';
import { LiveCallCard } from '../../features/calls/live-call-card';
import { CallsFilterBar } from '../../features/calls/calls-filter-bar';

export default function CallsPage() {
  return (
    <TenantShell title="Chamadas ao Vivo & Transcrições">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Monitoramento de chamadas
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Preview operacional de chamadas ativas, transcrições e protocolo de transbordo humano.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 h-9 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Atualizar</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2 h-9 text-xs">
              <Download className="h-3.5 w-3.5" />
              <span>Exportar</span>
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <CallsFilterBar />

        {/* Active Call Detail Card */}
        <LiveCallCard call={MOCK_DETAILED_CALL} />
      </div>
    </TenantShell>
  );
}
