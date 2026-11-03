import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { OperationsAttemptRow } from '@voice-agent/contracts';
import { AttemptsTable } from '../campaign-reports/campaign-attempts-table';
import { OperationsKpis } from './operations-kpis';
import { OperationsNotices } from './operations-notices';
import { RunningCampaignsCard } from './running-campaigns-card';
import { OVERVIEW } from './fixtures/overview-fixture';

const html = (node: React.ReactElement) => renderToString(node).replaceAll('<!-- -->', '');

describe('operations overview components', () => {
  it('shows only persisted counts in the KPIs', () => {
    const out = html(<OperationsKpis overview={OVERVIEW} />);
    expect(out).toContain('data-testid="kpi-attempts">4<');
    expect(out).toContain('2 nunca enviadas');
    expect(out).toContain('data-testid="kpi-unknown">1<');
    expect(out).toContain('1 aguardando revisão manual');
    expect(out).toContain('data-testid="kpi-live">0<');
  });

  it('lists running campaigns with held-by-pause separated and links to the report', () => {
    const out = html(<RunningCampaignsCard orgSlug="org-a" campaigns={OVERVIEW.campaigns} />);
    expect(out).toContain('0 ativa(s) · 1 pausada(s) · 1 rascunho(s)');
    expect(out).toContain('1 retidos pela pausa');
    expect(out).toContain('/orgs/org-a/campaigns/c1/report');
    const empty = html(
      <RunningCampaignsCard orgSlug="org-a" campaigns={{ ...OVERVIEW.campaigns, running: [] }} />,
    );
    expect(empty).toContain('running-campaigns-empty');
  });

  it('states what is not available instead of simulating it', () => {
    const out = html(<OperationsNotices />);
    for (const id of ['live', 'handoff', 'dispositions', 'transcripts']) {
      expect(out).toContain(`notice-${id}`);
    }
  });

  it('shows the source campaign of each attempt, including batch jobs without one', () => {
    const row = (id: string, campaignName: string | null): OperationsAttemptRow => ({
      attemptId: id,
      jobId: 'j',
      attemptNumber: 1,
      destinationMasked: '+55 11 •••••-0001',
      state: 'ORIGINATION_PENDING',
      outcome: 'NOT_SENT_PENDING',
      sent: false,
      requiresManualReview: false,
      createdAt: '2026-11-01T00:00:00.000Z',
      sendStartedAt: null,
      lastEventAt: null,
      callDurationSeconds: null,
      campaignId: campaignName ? 'c1' : null,
      campaignName,
    });
    const out = html(
      <AttemptsTable
        orgSlug="org-a"
        endpoint="/api/operations/attempts"
        initial={[row('a1', 'Reativação'), row('a2', null)]}
      />,
    );
    expect(out).toContain('Reativação');
    expect(out).toContain('Sem campanha (lote)');
    expect(out).toContain('+55 11 •••••-0001');
  });
});
