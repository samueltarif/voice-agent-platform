import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { OrganizationSwitcher, type OrganizationSummary } from './organization-switcher.js';

const ORG_A: OrganizationSummary = {
  slug: 'acme-corp',
  name: 'Acme Corporation',
  role: 'ADMIN',
};

const ORG_B: OrganizationSummary = {
  slug: 'globex-inc',
  name: 'Globex Inc',
  role: 'VIEWER',
};

describe('OrganizationSwitcher (Component)', () => {
  it('renders fallback badge when no organization is active', () => {
    const html = renderToString(
      React.createElement(OrganizationSwitcher, {
        currentOrg: null,
      }),
    );
    expect(html).toContain('Nenhuma organização ativa');
  });

  it('renders single organization without dropdown when user has only 1 organization', () => {
    const html = renderToString(
      React.createElement(OrganizationSwitcher, {
        currentOrg: ORG_A,
        organizations: [ORG_A],
      }),
    );
    expect(html).toContain('Acme Corporation');
    expect(html).not.toContain('Minhas Organizações');
  });

  it('renders interactive dropdown trigger with accessible aria-label when multiple organizations exist', () => {
    const html = renderToString(
      React.createElement(OrganizationSwitcher, {
        currentOrg: ORG_A,
        organizations: [ORG_A, ORG_B],
      }),
    );
    expect(html).toContain('Acme Corporation');
    expect(html).toContain('aria-label="Organização ativa: Acme Corporation. Clique para trocar."');
  });
});
