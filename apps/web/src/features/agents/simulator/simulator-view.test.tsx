import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../agent-default-configuration.js';
import { SIMULATOR_OFFLINE_LABEL } from './simulator-offline-banner.js';
import { SimulatorView } from './simulator-view.js';

const config = { ...DEFAULT_AGENT_CONFIGURATION_V1, tools: ['catalog.search' as const] };
const base = { organizationName: 'Org Ativa', orgSlug: 'org-ativa', agentId: 'agent-1' };

describe('SimulatorView', () => {
  it('always shows the offline banner, even with a notice and no data', () => {
    const html = renderToString(
      <SimulatorView {...base} agentName={null} selection={null} notice="Sem permissão." />,
    );
    expect(html).toContain(SIMULATOR_OFFLINE_LABEL);
    expect(html).toContain('Sem permissão.');
    expect(html).not.toContain('simulator-context-card');
  });

  it('has no chat, form, input or action button; only navigation links', () => {
    const html = renderToString(
      <SimulatorView
        {...base}
        agentName="Agente"
        notice={null}
        selection={{ selected: { kind: 'DRAFT', config }, available: ['DRAFT'] }}
      />,
    );
    expect(html).not.toMatch(/<button|<form|<textarea|<input|contenteditable/);
    expect(html).toContain('href="/orgs/org-ativa/agents/agent-1"');
    expect(html).toContain('href="/orgs/org-ativa/agents/agent-1/simulador?config=rascunho"');
    expect(html).toContain('role="note"');
    expect(html).toContain('<h1');
    expect(html).not.toMatch(/tabindex="-1"/);
  });
});
