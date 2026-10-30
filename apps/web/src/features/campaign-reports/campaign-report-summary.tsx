import * as React from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { CampaignReport } from '@voice-agent/contracts';
import { CAMPAIGN_PROGRESS_ROWS } from '../campaigns/campaign-labels';
import { OUTCOME_LABELS, OUTCOME_ORDER } from './report-labels';

function Metric(props: {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
  readonly testId: string;
}) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{props.label}</dt>
      <dd className="text-lg font-bold" data-testid={props.testId}>
        {props.value}
      </dd>
      {props.hint && <p className="mt-1 text-[11px] text-muted-foreground">{props.hint}</p>}
    </div>
  );
}

/** Contatos (jobs) e tentativas por situação — somente contagens persistidas. */
export function CampaignReportSummary({ report }: { readonly report: CampaignReport }) {
  const { progress, attempts } = report;
  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contatos agendados ({progress.total})</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CAMPAIGN_PROGRESS_ROWS.map((row) => (
              <Metric
                key={row.key}
                label={row.label}
                value={progress[row.key]}
                testId={`report-progress-${row.key}`}
              />
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tentativas de discagem ({attempts.total})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground" data-testid="report-attempts-sent">
            {attempts.sent} com envio iniciado · {attempts.total - attempts.sent} nunca enviadas
            {attempts.requiresManualReview > 0 &&
              ` · ${attempts.requiresManualReview} aguardando revisão manual`}
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {OUTCOME_ORDER.map((outcome) => (
              <Metric
                key={outcome}
                label={OUTCOME_LABELS[outcome].label}
                hint={OUTCOME_LABELS[outcome].hint}
                value={attempts.byOutcome[outcome]}
                testId={`report-outcome-${outcome}`}
              />
            ))}
          </dl>
          <p
            className="flex items-start gap-2 text-xs text-muted-foreground"
            data-testid="report-dispositions"
          >
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            Desfechos da conversa (atendida, ocupado, caixa postal) ainda não estão disponíveis:
            dependem da integração com o provedor de telefonia.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
