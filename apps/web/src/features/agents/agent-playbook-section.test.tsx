import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentPlaybookSection } from './agent-playbook-section.js';

describe('AgentPlaybookSection', () => {
  it('renders stages when playbook has items', () => {
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentPlaybookSection, {
        playbook: {
          stages: [
            { name: 'Abertura', goal: 'Saudar o cliente' },
            { name: 'Qualificação', goal: 'Entender a demanda' },
          ],
        },
        onChange,
      }),
    );

    expect(html).toContain('Playbook e Etapas');
    expect(html).toContain('Etapa 1');
    expect(html).toContain('Abertura');
    expect(html).toContain('Saudar o cliente');
    expect(html).toContain('Etapa 2');
    expect(html).toContain('Qualificação');
    expect(html).toContain('Entender a demanda');
  });

  it('renders empty message when no stages defined', () => {
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentPlaybookSection, {
        playbook: { stages: [] },
        onChange,
      }),
    );

    expect(html).toContain('Nenhuma etapa de playbook definida.');
  });
});
