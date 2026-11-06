import * as React from 'react';
import { FlaskConical } from 'lucide-react';

export const SIMULATOR_OFFLINE_LABEL = 'Simulação offline — sem IA, voz ou telefonia real';

/** Faixa fixa no topo: o simulador mostra regras determinísticas, não conversa real. */
export function SimulatorOfflineBanner() {
  return (
    <div
      role="note"
      aria-label={SIMULATOR_OFFLINE_LABEL}
      data-testid="simulator-offline-banner"
      className="sticky top-0 z-10 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-semibold">{SIMULATOR_OFFLINE_LABEL}</p>
        <p className="font-normal">
          Mostra o que as regras determinísticas calculam a partir da configuração salva. Nada é
          executado, enviado a fornecedores ou salvo.
        </p>
      </div>
    </div>
  );
}
