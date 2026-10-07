import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentToolsSection } from './agent-tools-section.js';

describe('AgentToolsSection (Component)', () => {
  it('renders tools section title, description and canonical tools', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(AgentToolsSection, {
        tools: ['agent.operating_hours'],
        onChange,
        disabled: false,
      }),
    );

    expect(html).toContain('Ferramentas do Agente (Tools)');
    expect(html).toContain('agent.operating_hours');
    expect(html).toContain('Consulta de Horários de Atendimento');
    expect(html).toContain('1 ativa');
  });

  it('renders badge with 0 ativas when no tools are configured', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(AgentToolsSection, {
        tools: [],
        onChange,
        disabled: false,
      }),
    );

    expect(html).toContain('0 ativas');
  });

  it('renders disabled input when disabled prop is true', () => {
    const onChange = vi.fn();
    const html = renderToString(
      React.createElement(AgentToolsSection, {
        tools: ['agent.operating_hours'],
        onChange,
        disabled: true,
      }),
    );

    expect(html).toContain('disabled=""');
  });
});
