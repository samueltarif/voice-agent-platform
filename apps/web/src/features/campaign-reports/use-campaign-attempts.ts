'use client';

import * as React from 'react';
import type { AttemptOutcomeClass, CampaignAttemptRow } from '@voice-agent/contracts';
import { operationsRequest } from '../../lib/operations/operations-client';
import { ATTEMPTS_PAGE_SIZE } from './report-labels';

export interface AttemptsPageState {
  readonly rows: readonly CampaignAttemptRow[] | null;
  readonly loading: boolean;
}

/**
 * Página de tentativas com filtro por situação. Pede uma linha a mais para
 * saber se existe próxima página sem contar o total.
 */
export function useCampaignAttempts(
  orgSlug: string,
  campaignId: string,
  initial: readonly CampaignAttemptRow[],
) {
  const [outcome, setOutcome] = React.useState<AttemptOutcomeClass | ''>('');
  const [offset, setOffset] = React.useState(0);
  const [state, setState] = React.useState<AttemptsPageState>({ rows: initial, loading: false });
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(ATTEMPTS_PAGE_SIZE + 1),
      offset: String(offset),
      ...(outcome ? { outcome } : {}),
    });
    setState((s) => ({ ...s, loading: true }));
    operationsRequest<{ attempts: CampaignAttemptRow[] }>(
      orgSlug,
      `/api/campaigns/${campaignId}/attempts?${params.toString()}`,
      { signal: controller.signal },
    )
      .then((res) => setState({ rows: res.attempts, loading: false }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ rows: null, loading: false });
      });
    return () => controller.abort();
  }, [orgSlug, campaignId, outcome, offset]);

  const changeOutcome = (next: AttemptOutcomeClass | '') => {
    setOutcome(next);
    setOffset(0);
  };
  const rows = state.rows?.slice(0, ATTEMPTS_PAGE_SIZE) ?? null;
  const hasNext = (state.rows?.length ?? 0) > ATTEMPTS_PAGE_SIZE;
  return { outcome, changeOutcome, offset, setOffset, rows, hasNext, loading: state.loading };
}
