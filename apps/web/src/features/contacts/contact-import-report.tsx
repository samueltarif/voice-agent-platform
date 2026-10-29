'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import type { ContactImportReport } from '../../lib/operations/operations-types';
import { IMPORT_REJECTION_LABELS } from './contact-labels';

const SHOWN_REJECTIONS = 50;

/** O CSV de recusas já vem neutralizado contra injeção de fórmula pela API. */
function downloadRejected(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'linhas-recusadas.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function ContactImportReportView({ report }: { readonly report: ContactImportReport }) {
  const totals = [
    { label: 'Novos contatos', value: report.created },
    { label: 'Já existentes', value: report.existing },
    { label: 'Adicionados à lista', value: report.addedToList },
    { label: 'Com supressão', value: report.suppressed },
    { label: 'Linhas recusadas', value: report.rejected.length },
  ];
  return (
    <section
      aria-label="Resultado da importação"
      data-testid="contact-import-report"
      className="space-y-3"
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {totals.map((t) => (
          <div key={t.label} className="rounded-md border border-border/60 p-2">
            <dt className="text-[11px] text-muted-foreground">{t.label}</dt>
            <dd className="text-base font-bold">{t.value}</dd>
          </div>
        ))}
      </dl>
      {report.suppressed > 0 && (
        <p className="text-xs text-muted-foreground">
          Contatos com supressão ficam na lista, mas nunca são agendados nem discados.
        </p>
      )}
      {report.rejected.length > 0 && (
        <div className="space-y-2">
          <ul className="max-h-48 overflow-auto rounded-md border border-border/60 text-xs">
            {report.rejected.slice(0, SHOWN_REJECTIONS).map((r) => (
              <li
                key={r.rowNumber}
                className="flex justify-between gap-2 border-b border-border/40 p-2"
              >
                <span>Linha {r.rowNumber}</span>
                <span className="text-muted-foreground">{IMPORT_REJECTION_LABELS[r.reason]}</span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px] gap-2"
            onClick={() => downloadRejected(report.rejectedRowsCsv)}
          >
            <Download className="h-4 w-4" /> Baixar linhas recusadas (CSV)
          </Button>
        </div>
      )}
    </section>
  );
}
