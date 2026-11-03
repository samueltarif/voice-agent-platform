import * as React from 'react';
import { Card, CardContent } from '@voice-agent/ui';
import type { OperationsOverview } from '@voice-agent/contracts';

function Kpi(props: {
  readonly label: string;
  readonly value: number;
  readonly note: string;
  readonly testId: string;
}) {
  return (
    <Card className="border-border/60 shadow-xs">
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{props.label}</p>
        <p className="text-2xl font-bold" data-testid={props.testId}>
          {props.value}
        </p>
        <p className="text-[11px] text-muted-foreground">{props.note}</p>
      </CardContent>
    </Card>
  );
}

/** Indicadores do período — só contagens persistidas, nunca estimativas. */
export function OperationsKpis({ overview }: { readonly overview: OperationsOverview }) {
  const { attempts, periodDays } = overview;
  const unknown = attempts.byOutcome.OUTCOME_UNKNOWN;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label={`Tentativas (${periodDays} dias)`}
        value={attempts.total}
        note={`${attempts.total - attempts.sent} nunca enviadas`}
        testId="kpi-attempts"
      />
      <Kpi
        label="Com envio iniciado"
        value={attempts.sent}
        note="Gravado antes de qualquer discagem"
        testId="kpi-sent"
      />
      <Kpi
        label="Resultado desconhecido"
        value={unknown}
        note={`${attempts.requiresManualReview} aguardando revisão manual`}
        testId="kpi-unknown"
      />
      <Kpi
        label="Chamadas ao vivo agora"
        value={overview.liveSessions}
        note="Sessões conectando ou em andamento"
        testId="kpi-live"
      />
    </div>
  );
}
