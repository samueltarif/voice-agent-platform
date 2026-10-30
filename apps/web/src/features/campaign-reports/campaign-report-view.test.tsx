import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { CampaignAttemptRow, CampaignReport } from '@voice-agent/contracts';
import { CampaignReportView } from './campaign-report-view';
import { CampaignReportCosts } from './campaign-report-costs';

const ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const report: CampaignReport = {
  campaignId: ID,
  campaignStatus: 'PAUSED',
  progress: {
    total: 6,
    scheduled: 1,
    inProgress: 2,
    heldByPause: 1,
    completed: 0,
    failed: 0,
    canceled: 2,
  },
  attempts: {
    total: 7,
    sent: 4,
    requiresManualReview: 1,
    byOutcome: {
      NOT_SENT_PENDING: 0,
      HELD_BY_PAUSE: 1,
      IN_FLIGHT: 1,
      OUTCOME_UNKNOWN: 1,
      NO_CALL_CREATED: 1,
      CANCELED_BEFORE_SEND: 2,
      ENDED: 1,
    },
  },
  costs: {
    currency: 'USD',
    settled: { carrier: 150, conversational: 100, total: 250 },
    settledAttempts: 1,
    reservedOpen: { carrier: 300, conversational: 200, total: 500 },
    openReservations: 1,
  },
  dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' },
};

const row: CampaignAttemptRow = {
  attemptId: 'a1',
  jobId: 'j1',
  attemptNumber: 1,
  destinationMasked: '+55 11 •••••-0003',
  state: 'ORIGINATION_PENDING',
  outcome: 'HELD_BY_PAUSE',
  sent: false,
  requiresManualReview: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  sendStartedAt: null,
  lastEventAt: null,
  callDurationSeconds: null,
};

const render = (r: CampaignReport, attempts: CampaignAttemptRow[] = [row]) =>
  renderToString(
    <CampaignReportView orgSlug="org-a" campaignName="Reativação" report={r} attempts={attempts} />,
  ).replaceAll('<!-- -->', '');

describe('CampaignReportView', () => {
  it('shows held, unsent, sent, ended, canceled and unknown separately with real counts', () => {
    const html = render(report);
    expect(html).toContain('data-testid="report-progress-heldByPause">1<');
    expect(html).toContain('data-testid="report-outcome-HELD_BY_PAUSE">1<');
    expect(html).toContain('data-testid="report-outcome-NOT_SENT_PENDING">0<');
    expect(html).toContain('data-testid="report-outcome-OUTCOME_UNKNOWN">1<');
    expect(html).toContain('data-testid="report-outcome-CANCELED_BEFORE_SEND">2<');
    expect(html).toContain('data-testid="report-outcome-ENDED">1<');
    expect(html).toContain('4 com envio iniciado · 3 nunca enviadas · 1 aguardando revisão manual');
  });

  it('declares conversation dispositions unavailable instead of inventing them', () => {
    expect(render(report)).toContain('ainda não estão disponíveis');
  });

  it('separates settled cost from the reserved estimate', () => {
    const html = render(report).replace(/\s/g, ' ');
    expect(html).toContain('data-testid="report-costs-settled"');
    expect(html).toMatch(/Liquidado.*US\$ 2,50/);
    expect(html).toMatch(/Reservado \(estimativa\).*US\$ 5,00/);
    expect(html).toContain('não é custo incorrido');
  });

  it('hides costs from roles the API did not authorize', () => {
    const html = renderToString(<CampaignReportCosts costs={null} />);
    expect(html).toContain('report-costs-restricted');
    expect(html).not.toContain('Liquidado');
  });

  it('lists attempts with masked destinations only and explains unsent ones', () => {
    const html = render(report);
    expect(html).toContain('+55 11 •••••-0003');
    expect(html).toContain('Não enviada');
    expect(html).toContain('Retidas pela pausa');
    expect(render(report, [])).toContain('attempts-empty');
  });
});
