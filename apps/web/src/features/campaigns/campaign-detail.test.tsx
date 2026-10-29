import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import type { CampaignDetailView } from '../../lib/operations/operations-types';
import { CampaignDetail } from './campaign-detail';
import { CampaignList } from './campaign-list';
import { CampaignCreateForm } from './campaign-create-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const LIST = { id: 'l1', name: 'Base <script>' };

function detail(status: CampaignDetailView['campaign']['status'], withAudience = true) {
  return {
    campaign: {
      id: 'c1',
      organizationId: 'o1',
      agentId: 'a1',
      agentVersionId: 'v1',
      name: 'Reativação',
      status,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    progress: { total: 4, scheduled: 1, inProgress: 1, completed: 1, failed: 0, canceled: 1 },
    audience: withAudience ? { contactListId: 'l1', scheduledStartAt: null } : null,
  } satisfies CampaignDetailView;
}

const render = (role: string, view: CampaignDetailView, lists = [LIST]) =>
  renderToString(
    <CampaignDetail orgSlug="org-a" role={role} initial={view} lists={lists} />,
  ).replaceAll('<!-- -->', '');

describe('CampaignDetail', () => {
  it('lets a MANAGER edit the audience and start a draft', () => {
    const html = render('MANAGER', detail('DRAFT'));
    expect(html).toContain('Iniciar campanha');
    expect(html).toContain('Salvar audiência');
    expect(html).toContain('Base &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows a read-only view to a VIEWER (no actions, no audience form)', () => {
    const html = render('VIEWER', detail('ACTIVE'));
    expect(html).toContain('campaign-actions-none');
    expect(html).not.toContain('Salvar audiência');
    expect(html).not.toContain('Pausar');
  });

  it('offers an OPERATOR only protective actions and never audience edits', () => {
    const html = render('OPERATOR', detail('DRAFT'));
    expect(html).toContain('Cancelar campanha');
    expect(html).not.toContain('Iniciar campanha');
    expect(html).not.toContain('Salvar audiência');
  });

  it('freezes the audience once the campaign left DRAFT', () => {
    expect(render('OWNER', detail('ACTIVE'))).not.toContain('Salvar audiência');
  });

  it('renders the real progress and the offline notice', () => {
    const html = render('OWNER', detail('ACTIVE'));
    expect(html).toContain('4 contatos agendados no total');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('campaign-offline-notice');
  });

  it('points to contacts when a draft has no list to choose', () => {
    const html = render('OWNER', detail('DRAFT', false), []);
    expect(html).toContain('Nenhuma lista definida.');
    expect(html).toContain('/orgs/org-a/contacts');
  });
});

describe('CampaignList and CampaignCreateForm', () => {
  it('renders an explicit empty state and tenant-scoped links', () => {
    expect(renderToString(<CampaignList campaigns={[]} orgSlug="org-a" />)).toContain(
      'campaign-list-empty',
    );
    const html = renderToString(
      <CampaignList campaigns={[detail('PAUSED').campaign]} orgSlug="org-a" />,
    );
    expect(html).toContain('/orgs/org-a/campaigns/c1');
    expect(html).toContain('Pausada');
  });

  it('explains that a published agent is required instead of offering an empty form', () => {
    const html = renderToString(<CampaignCreateForm orgSlug="org-a" agents={[]} />);
    expect(html).toContain('campaign-create-no-agents');
    expect(html).not.toContain('Criar rascunho');
  });
});
