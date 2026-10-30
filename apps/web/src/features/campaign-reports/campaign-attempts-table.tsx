'use client';

import * as React from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { AttemptOutcomeClass, CampaignAttemptRow } from '@voice-agent/contracts';
import { formatAgentDate } from '../agents/agent-date-formatter';
import { FieldLabel, OPERATION_FIELD } from '../operations/operation-feedback';
import { ATTEMPTS_PAGE_SIZE, OUTCOME_LABELS, OUTCOME_ORDER, formatDuration } from './report-labels';
import { useCampaignAttempts } from './use-campaign-attempts';

function AttemptRow({ row }: { readonly row: CampaignAttemptRow }) {
  return (
    <li className="grid gap-1 p-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4">
      <span className="font-mono" data-testid="attempt-destination">
        {row.destinationMasked}
        <span className="ml-2 text-xs text-muted-foreground">#{row.attemptNumber}</span>
      </span>
      <Badge variant="outline" className="w-fit text-xs">
        {OUTCOME_LABELS[row.outcome].label}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {row.sent ? `Enviada ${formatAgentDate(row.sendStartedAt)}` : 'Não enviada'}
        {row.requiresManualReview && ' · revisão manual'}
      </span>
      <span className="text-xs text-muted-foreground">
        Duração {formatDuration(row.callDurationSeconds)}
      </span>
    </li>
  );
}

function AttemptList({ rows }: { readonly rows: readonly CampaignAttemptRow[] | null }) {
  if (rows === null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar as tentativas.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="attempts-empty">
        Nenhuma tentativa nesta situação.
      </p>
    );
  }
  return (
    <ul
      role="list"
      className="divide-y divide-border rounded-md border border-border/60"
      data-testid="attempts-list"
    >
      {rows.map((row) => (
        <AttemptRow key={row.attemptId} row={row} />
      ))}
    </ul>
  );
}

interface CampaignAttemptsTableProps {
  readonly orgSlug: string;
  readonly campaignId: string;
  readonly initial: readonly CampaignAttemptRow[];
}

/** Tentativas da campanha, mais recentes primeiro; telefones já mascarados pela API. */
export function CampaignAttemptsTable({
  orgSlug,
  campaignId,
  initial,
}: CampaignAttemptsTableProps) {
  const view = useCampaignAttempts(orgSlug, campaignId, initial);
  return (
    <Card className="border-border/60 shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tentativas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-xs space-y-1.5">
          <FieldLabel htmlFor="attempts-outcome">Situação</FieldLabel>
          <select
            id="attempts-outcome"
            className={`${OPERATION_FIELD} w-full`}
            value={view.outcome}
            onChange={(e) => view.changeOutcome(e.target.value as AttemptOutcomeClass | '')}
          >
            <option value="">Todas</option>
            {OUTCOME_ORDER.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o].label}
              </option>
            ))}
          </select>
        </div>
        <div aria-busy={view.loading} aria-live="polite">
          <AttemptList rows={view.rows} />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            disabled={view.loading || view.offset === 0}
            onClick={() => view.setOffset(Math.max(0, view.offset - ATTEMPTS_PAGE_SIZE))}
          >
            Anteriores
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            disabled={view.loading || !view.hasNext}
            onClick={() => view.setOffset(view.offset + ATTEMPTS_PAGE_SIZE)}
          >
            Próximas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
