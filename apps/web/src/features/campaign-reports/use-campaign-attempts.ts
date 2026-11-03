'use client';

import * as React from 'react';
import type {
  AttemptOutcomeClass,
  CampaignAttemptRow,
  OperationsAttemptRow,
} from '@voice-agent/contracts';
import { operationsRequest } from '../../lib/operations/operations-client';
import { ATTEMPTS_PAGE_SIZE } from './report-labels';

const NO_PARAMS: Readonly<Record<string, string>> = {};

/** Linha de tentativa: da campanha ou da organização (com a campanha de origem). */
export type AttemptRow = CampaignAttemptRow | OperationsAttemptRow;

export interface AttemptsPageState {
  readonly rows: readonly AttemptRow[] | null;
  readonly loading: boolean;
}

/**
 * Página de tentativas com filtro por situação. `endpoint` é a rota do BFF
 * (campanha ou organização). Pede uma linha a mais para saber se existe
 * próxima página sem contar o total.
 */
/** Rota do BFF e parâmetros fixos (ex.: período) — iguais aos da carga inicial. */
export interface AttemptsSource {
  readonly endpoint: string;
  readonly fixedParams?: Readonly<Record<string, string>> | undefined;
}

export function useAttemptsPage(
  orgSlug: string,
  source: AttemptsSource,
  initial: readonly AttemptRow[],
) {
  const { endpoint } = source;
  const fixedParams = source.fixedParams ?? NO_PARAMS;
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
      ...fixedParams,
      limit: String(ATTEMPTS_PAGE_SIZE + 1),
      offset: String(offset),
      ...(outcome ? { outcome } : {}),
    });
    setState((s) => ({ ...s, loading: true }));
    operationsRequest<{ attempts: AttemptRow[] }>(orgSlug, `${endpoint}?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => setState({ rows: res.attempts, loading: false }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ rows: null, loading: false });
      });
    return () => controller.abort();
  }, [orgSlug, endpoint, fixedParams, outcome, offset]);

  const changeOutcome = (next: AttemptOutcomeClass | '') => {
    setOutcome(next);
    setOffset(0);
  };
  const rows = state.rows?.slice(0, ATTEMPTS_PAGE_SIZE) ?? null;
  const hasNext = (state.rows?.length ?? 0) > ATTEMPTS_PAGE_SIZE;
  return { outcome, changeOutcome, offset, setOffset, rows, hasNext, loading: state.loading };
}
