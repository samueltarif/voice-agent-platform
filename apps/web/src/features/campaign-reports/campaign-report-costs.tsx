import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { CampaignCostSummary, MinorUnitsBreakdown } from '@voice-agent/contracts';
import { formatMinorUnits } from './report-labels';

function Breakdown(props: {
  readonly title: string;
  readonly note: string;
  readonly values: MinorUnitsBreakdown;
  readonly currency: string | null;
  readonly testId: string;
}) {
  const money = (n: number) => formatMinorUnits(n, props.currency);
  return (
    <section
      className="space-y-1 rounded-md border border-border/60 p-3"
      data-testid={props.testId}
    >
      <h4 className="text-sm font-semibold">{props.title}</h4>
      <p className="text-[11px] text-muted-foreground">{props.note}</p>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[11px] text-muted-foreground">Telefonia</dt>
          <dd>{money(props.values.carrier)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Conversacional</dt>
          <dd>{money(props.values.conversational)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Total</dt>
          <dd className="font-semibold">{money(props.values.total)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Custos do ledger: liquidado (real) separado da reserva (estimativa). */
export function CampaignReportCosts({ costs }: { readonly costs: CampaignCostSummary | null }) {
  return (
    <Card className="border-border/60 shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Custos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {costs === null ? (
          <p className="text-sm text-muted-foreground" data-testid="report-costs-restricted">
            Custos visíveis apenas para proprietários, administradores e gerentes.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Breakdown
              title="Liquidado"
              note={`Custo real registrado no ledger (${costs.settledAttempts} tentativa(s)).`}
              values={costs.settled}
              currency={costs.currency}
              testId="report-costs-settled"
            />
            <Breakdown
              title="Reservado (estimativa)"
              note={`Valor ainda bloqueado para ${costs.openReservations} tentativa(s); não é custo incorrido.`}
              values={costs.reservedOpen}
              currency={costs.currency}
              testId="report-costs-reserved"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
